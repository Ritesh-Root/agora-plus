import { LLMMessage } from '../llm/types';
import { createProvider, isValidKey, defaultModelFor } from '../llm/providers';
import { PROVIDERS, DEFAULT_PROVIDER } from '../llm/constants';
import { wireAgent } from '../llm/connections';
import { useUiStore } from '../../integration/store/uiStore';
import { useCoreStore } from '../../integration/store/coreStore';
import { ToolRegistry } from './ToolRegistry';
import { PromptBuilder } from './PromptBuilder';
import { AgentNode } from '../../data/agents';

export interface BrainHost {
  data: AgentNode;
  simulation: {
    getAllAgents: () => any[];
    processScheduledTasks: () => void;
  };
  getCurrentTaskId: () => string | null;
}

export interface ThinkOptions {
  isChat?: boolean;
  tools?: any[];
  silent?: boolean;
}

export class AgentBrain {
  private history: LLMMessage[] = [];
  public isThinking: boolean = false;

  constructor(private readonly host: BrainHost) {
    this.refreshFromStore();
  }

  public async think(prompt: string, options: ThinkOptions = {}): Promise<{ text: string, toolCalls: any[] }> {
    if (this.isThinking) return { text: '', toolCalls: [] };
    this.isThinking = true;

    try {
      this.refreshFromStore();
      const core = useCoreStore.getState();
      const llmConfig = useUiStore.getState().llmConfig;
      const wired = wireAgent(this.host.data, useUiStore.getState().connections);
      const ownConnection = wired.baseUrl !== undefined;
      const apiKey = ownConnection ? (wired.apiKey || '') : (llmConfig.apiKey || '');
      const baseUrl = wired.baseUrl || llmConfig.baseUrl;
      // An agent's own connection is typed from its own key and URL, never the default connection's provider.
      const provider = apiKey.startsWith('nvapi-') || (baseUrl || '').includes('api.nvidia.com')
        ? 'nvidia'
        : ownConnection ? DEFAULT_PROVIDER : (llmConfig.provider ?? DEFAULT_PROVIDER);
      const spec = PROVIDERS[provider];
      if (!apiKey) {
        throw new Error(ownConnection ? 'Add an API key for that model endpoint.' : `${spec.label} API key is required`);
      }
      if (!isValidKey(provider, apiKey)) {
        throw new Error(`A valid ${spec.label} API key (${spec.keyPlaceholder}) is required`);
      }

      const llm = createProvider(provider, apiKey, baseUrl);
      const model = wired.model || llmConfig.model?.trim() || defaultModelFor(provider);

      // 1. Manage Message History
      if (!options.isChat) {
        const userMsg: LLMMessage = {
          role: 'user',
          content: prompt,
          metadata: options.silent ? { internal: true } : undefined
        };

        this.history.push(userMsg);
        this.syncToStore();
      }

      // 2. Prepare context
      let messages: LLMMessage[] = this.history.slice(-10);

      const allAgents = this.host.simulation.getAllAgents();
      const systemPrompt = PromptBuilder.buildSystemPrompt(this.host.data, core.phase, core.userBrief, allAgents);
      const toolDefs = options.tools || ToolRegistry.getDefinitions(this.host.data.index, core.phase, this.host.data.subagents?.length || 0, this.host.data.canDelegate ?? false);

      // 3. Log and Execute LLM Call
      core.addRequestLog({
        agentIndex: this.host.data.index,
        agentName: this.host.data.name,
        systemInstruction: systemPrompt,
        contents: messages,
        systemTools: toolDefs,
        taskId: this.host.getCurrentTaskId() || undefined
      });

      const response = await llm.generateCompletion(
        messages,
        toolDefs,
        systemPrompt,
        model
      );

      // 4. Log Response
      core.addResponseLog({
        agentIndex: this.host.data.index,
        agentName: this.host.data.name,
        content: response.content || '',
        tool_calls: response.tool_calls,
        usage: response.usage,
        raw: response.raw,
        taskId: this.host.getCurrentTaskId() || undefined
      });

      // 5. Parse Tool Calls
      const text = response.content || '';
      const toolCalls = response.tool_calls?.map(tc => {
        try {
          return { name: tc.function.name, args: JSON.parse(tc.function.arguments) };
        } catch (e) {
          console.error('[AgentBrain] Failed to parse tool arguments', tc.function.arguments);
          return null;
        }
      }).filter(Boolean) as any[] || [];

      // 6. Final Message Construction
      const isInternalTrigger = options.silent;
      const hasToolCallsOnly = !text && toolCalls.length > 0;
      const isBrief = toolCalls.some(tc => tc.name === 'set_user_brief');
      const isResolution = false;
      let finalContent = text;
      const isMalformed = response.finishReason === 'MALFORMED_FUNCTION_CALL';

      if (isMalformed) {
        finalContent = 'ERROR: Malformed function call. Please try again.';
        console.warn(`[AgentBrain:${this.host.data.name}] Malformed function call detected.`);
      } else if (hasToolCallsOnly && !isInternalTrigger) {
        finalContent = isBrief
          ? "Project brief set. Let's begin!"
          : 'Working on it...';
      } else if (!text && toolCalls.length === 0 && !isInternalTrigger) {
        finalContent = '...';
      }

      // UI/UX handling for chat auto-closing
      if (options.isChat && (isBrief || isResolution)) {
        setTimeout(() => {
          if (useUiStore.getState().isChatting) useUiStore.getState().setChatting(false);
          useUiStore.getState().setSelectedNpc(null);
        }, 3000);
      }

      const isInternalMessage = isInternalTrigger || (hasToolCallsOnly && isInternalTrigger);
      this.history.push({
        role: 'assistant',
        content: finalContent,
        tool_calls: response.tool_calls,
        metadata: isInternalMessage ? { internal: true } : undefined
      });
      this.syncToStore();

      // 7. Process Actions (Tools)
      for (const tc of toolCalls) {
        const handled = ToolRegistry.process(this.host as any, tc);
        if (tc.name === 'deliver_project' && handled) continue;
      }

      return { text, toolCalls };
    } catch (error) {
      console.error(`[AgentBrain:${this.host.data.name}] Logic error:`, error);
      const errMsg = error instanceof Error ? error.message : String(error);
      useUiStore.getState().setBYOKOpen(true, errMsg);
      throw error;
    } finally {
      this.isThinking = false;
      this.host.simulation.processScheduledTasks();
    }
  }

  /** Autonomous Intent: Start the project strategy. */
  public async spark() {
    return this.think('Start the project by proposing initial tasks.', { silent: true });
  }

  /** Autonomous Intent: Work on a specific task. */
  public async executeTask(taskId: string) {
    return this.think(`Proceed with task: ${taskId}`, { silent: true });
  }

  /** Autonomous Intent: Finalize and deliver the project results. */
  public async concludeProject() {
    return this.think('All tasks are complete! Use the deliver_project tool to fulfill the final delivery with the project result.', { silent: true });
  }

  public async processFinalAsset(prompt: string, options: any) {
    const core = useCoreStore.getState();
    core.setIsGeneratingAsset(true);
    core.setReviewingOutput(false);

    try {
      const llmConfig = useUiStore.getState().llmConfig;
      const provider = llmConfig.provider ?? DEFAULT_PROVIDER;
      if (!isValidKey(provider, llmConfig.apiKey)) {
        throw new Error(`A valid ${PROVIDERS[provider].label} API key is required`);
      }

      core.setFinalOutput(prompt);
      core.setPhase('done');
      core.setFinalOutputOpen(true);
      core.setIsGeneratingAsset(false);
    } catch (error) {
      console.error('[AgentBrain] Final asset generation failed:', error);
      core.setIsGeneratingAsset(false);
      const errMsg = error instanceof Error ? error.message : String(error);
      useUiStore.getState().setBYOKOpen(true, errMsg);
      core.addLogEntry({
        agentIndex: 0,
        action: `Error finalizing output: ${errMsg}`,
        taskId: undefined
      });
    }
  }

  public appendHistory(message: LLMMessage) {
    this.refreshFromStore();
    this.history.push(message);
    this.syncToStore();
  }

  private refreshFromStore() {
    const history = useCoreStore.getState().agentHistories[this.host.data.index];
    if (history) this.history = [...history];
  }

  private syncToStore() {
    useCoreStore.getState().setAgentHistory(this.host.data.index, this.history);
  }
}
