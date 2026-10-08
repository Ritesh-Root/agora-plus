import { USER_COLOR } from '../theme/brand';
import { DEFAULT_MODELS } from '../core/llm/constants';

export const USER_ID = 'user';
export const USER_NAME = 'User';
export const MAX_AGENTS = 5;
export { USER_COLOR };

/** Number of human render-slots permanently reserved at the start of the GPU instance buffers (0..MAX_PLAYERS-1). */
export const MAX_PLAYERS = 5;

/**
 * Translates an AI agent's logical index (1..N, used by tasks/chat/tool calls/localStorage)
 * into its physical GPU render-slot index. Human players permanently occupy slots 0..MAX_PLAYERS-1,
 * so AI agents are shifted past them. Only use this at the GPU/rendering boundary — never store
 * a render index where a logical index is expected (coreStore, ToolRegistry, etc).
 */
export function toRenderIndex(agentLogicalIndex: number): number {
  return MAX_PLAYERS + (agentLogicalIndex - 1);
}

/** Inverse of toRenderIndex() — recovers an AI agent's logical index from its GPU render-slot index. */
export function toLogicalIndex(renderIndex: number): number {
  return renderIndex - MAX_PLAYERS + 1;
}
/** Household is the office the demo opens. Names match server/household/team.ts. */
export const DEFAULT_AGENTIC_SET_ID = 'household';
export interface AgentSkill {
  id: string;
  name: string;
  /** One-line summary shown in the skill picker. */
  description: string;
  /** Behavioral instructions injected into the agent's system prompt. */
  instructions: string;
}

export interface AgentNode {
  id: string;
  index: number;
  name: string;
  description: string;
  color: string;
  model: string;
  /** Saved connection. Missing means the room user's default connection. */
  connectionId?: string;
  humanInTheLoop?: boolean;
  /** Ids of reusable skills (from the skill library) attached to this agent. */
  skillIds?: string[];
  /** Per-agent tool: allow this agent to delegate work via propose_task. */
  canDelegate?: boolean;
  position?: { x: number; y: number };
  subagents?: AgentNode[];
}

/** Built-in skill palette — starting points users can attach to any agent (and then customize). */
export const BUILTIN_SKILLS: AgentSkill[] = [
  { id: 'web-research', name: 'Web Research', description: 'Find and synthesize credible, current information.', instructions: 'Prioritize primary sources, cite specifics, and flag uncertainty. Return findings as tight bullet points, each with its source.' },
  { id: 'code-review', name: 'Code Review', description: 'Audit code for correctness, security, and clarity.', instructions: 'Point to exact lines, explain the concrete risk, and propose a minimal fix. Flag only what matters — no praise, no nitpicks.' },
  { id: 'copywriting', name: 'Copywriting', description: 'Persuasive, on-brand short-form copy.', instructions: 'Lead with the benefit, cut filler, vary sentence length, and match the brand voice. Every word earns its place.' },
  { id: 'data-analysis', name: 'Data Analysis', description: 'Reason quantitatively from data.', instructions: 'State assumptions, show the calculation, give the headline number first, then the caveats. Never invent figures.' },
  { id: 'critical-reviewer', name: 'Critical Reviewer', description: 'Stress-test ideas and outputs.', instructions: 'Steelman the work, then surface the strongest objection, the likeliest failure mode, and the missing evidence. Be specific, not vague.' },
  { id: 'summarizer', name: 'Summarizer', description: 'Compress to the essential.', instructions: 'Open with a one-sentence takeaway, then 3–5 bullets. No preamble, no repetition.' },
  { id: 'brainstormer', name: 'Brainstormer', description: 'Generate diverse, non-obvious options.', instructions: 'Favor quantity then quality; include non-obvious angles. Tag each idea with its key upside and main risk.' },
  { id: 'fact-checker', name: 'Fact-Checker', description: 'Verify claims against sources.', instructions: 'Mark each claim Confirmed / Unsupported / False with a one-line reason and a source where possible.' },
];

export type OutputType = 'text' | 'image' | 'music' | 'video';
export interface AgenticSystem {
  id: string;
  teamName: string;
  teamType: string;
  teamDescription: string;
  color: string;
  outputType: OutputType;
  outputModel: string;
  outputAutoApprove?: boolean;
  user: {
    index: number;
    model: string;
    position?: { x: number; y: number };
  };
  leadAgent: AgentNode;
}

export const AGENTIC_SETS: AgenticSystem[] = [
  {
    id: 'household',
    teamName: 'Household',
    teamType: 'Home',
    teamDescription: 'Agora leads Scout, Planner, and Keeper. They research, schedule, and check the plan against what the household remembers.',
    color: '#6366C9',
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: true,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'household-agora',
      index: 1,
      name: 'Agora',
      description: 'Household lead. Decomposes the request into tasks and writes the final plan in plain language.',
      color: '#6366C9',
      model: DEFAULT_MODELS.text,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'household-scout',
          index: 2,
          name: 'Scout',
          description: 'Researches facts, prices, and options, and cites sources.',
          color: '#0F766E',
          model: DEFAULT_MODELS.text,
          skillIds: ['web-research'],
          position: { x: -300, y: 280 },
        },
        {
          id: 'household-planner',
          index: 3,
          name: 'Planner',
          description: 'Handles schedules, logistics, budgets, and shopping lists.',
          color: '#C2410C',
          model: DEFAULT_MODELS.text,
          position: { x: 0, y: 280 },
        },
        {
          id: 'household-keeper',
          index: 4,
          name: 'Keeper',
          description: 'Checks every plan against household memory (allergies, preferences, routines) and flags conflicts explicitly.',
          color: '#BE185D',
          model: DEFAULT_MODELS.text,
          skillIds: ['fact-checker'],
          position: { x: 300, y: 280 },
        },
      ],
    },
  },
  {
    id: 'creative-studio',
    teamName: 'Creative Studio',
    teamType: 'Agency',
    teamDescription: 'A full-service creative agency covering branding, design, development and go-to-market strategy.',
    color: '#4285F4',
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: true,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'agency-orchestrator',
      index: 1,
      name: 'Creative Director',
      description: 'Orchestrates branding, design, and development to deliver integrated creative solutions.',
      color: '#4285F4',
      model: DEFAULT_MODELS.text,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'agency-developer',
          index: 2,
          name: 'Developer',
          description: 'Architects and develops robust digital platforms and interactive experiences.',
          color: '#34A853',
          model: DEFAULT_MODELS.text,
          position: { x: -300, y: 280 }
        },
        {
          id: 'agency-designer',
          index: 3,
          name: 'Designer',
          description: 'Crafts visual identities, user interfaces, and premium brand aesthetics.',
          color: '#FBBC05',
          model: DEFAULT_MODELS.text,
          position: { x: 0, y: 280 }
        },
        {
          id: 'agency-copywriter',
          index: 4,
          name: 'Copywriter',
          description: 'Crafts compelling narratives and strategic messaging for brands.',
          color: '#EA4335',
          humanInTheLoop: true,
          model: DEFAULT_MODELS.text,
          position: { x: 300, y: 280 }
        }
      ]
    }
  },
  {
    id: 'photo-studio',
    teamName: 'Nano Banana Lab',
    teamType: 'Visual',
    teamDescription: 'A concept-writing team for turning visual briefs into structured text prompts.',
    color: '#FBBF24',
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: false,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'art-director',
      index: 1,
      name: 'Art Director',
      description: 'Synthesizes descriptions into valid Nano Banana prompts.',
      color: '#FBBF24',
      humanInTheLoop: true,
      model: DEFAULT_MODELS.text,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'scene-designer',
          index: 2,
          name: 'Scene Designer',
          description: 'Focuses on Subject and Action within the scene.',
          color: '#F59E0B',
          humanInTheLoop: true,
          model: DEFAULT_MODELS.text,
          position: { x: -150, y: 280 }
        },
        {
          id: 'lighting-stylist',
          index: 3,
          name: 'Lighting Stylist',
          description: 'Focuses on Composition, Lighting, and Style/Materiality.',
          color: '#E0E672',
          humanInTheLoop: true,
          model: DEFAULT_MODELS.text,
          position: { x: 150, y: 280 }
        }
      ]
    }
  },
  {
    id: 'music-studio',
    teamName: 'Lyria Factory',
    teamType: 'Music Production',
    teamDescription: 'A songwriting and arrangement team for text-based music briefs.',
    color: '#43E47C',
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: false,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'master-producer',
      index: 1,
      name: 'Master Producer',
      description: 'Orchestrates the 4 pillars of sound into a cohesive track.',
      color: '#43E47C',
      model: DEFAULT_MODELS.text,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'genre-expert',
          index: 2,
          name: 'Genre Expert',
          description: 'Defines style, mood, and global aesthetic (e.g., Synthwave, Lofi).',
          color: '#74D295',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: -450, y: 280 }
        },
        {
          id: 'tempo-architect',
          index: 3,
          name: 'Tempo Architect',
          description: 'Specifies BPM, rhythmical complexity, and time signatures.',
          color: '#92D540',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: -150, y: 280 }
        },
        {
          id: 'instrumentalist',
          index: 4,
          name: 'Instrumentalist',
          description: 'Selects timbres, arrangement, and orchestration layers.',
          color: '#40D5AD',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: 150, y: 280 }
        },
        {
          id: 'dynamics-engineer',
          index: 5,
          name: 'Dynamics Engineer',
          description: 'Controls volume, texture, contrast, and emotional progression.',
          color: '#50BB55',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: 450, y: 280 }
        }
      ]
    }
  },
  {
    id: 'film-studio',
    teamName: 'Veo Studio',
    teamType: 'Cinematic',
    teamDescription: 'A screenwriting and shot-planning team for cinematic briefs.',
    color: '#E64347',
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: false,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'film-director',
      index: 1,
      name: 'Film Director',
      description: 'Orchestrates visuals and soundstage with global cinematic vision.',
      color: '#E64347',
      model: DEFAULT_MODELS.text,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'visual-lead',
          index: 2,
          name: 'Visual Lead',
          description: 'Manages cinematography and VFX direction.',
          color: '#F17DC5',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: -200, y: 280 },
          subagents: [
            {
              id: 'cinematographer',
              index: 4,
              name: 'Cinematographer',
              description: 'Defines camera work, shot composition, and subject action.',
              color: '#E643C5',
              model: DEFAULT_MODELS.text,
              position: { x: -200, y: 430 }
            }
          ]
        },
        {
          id: 'audio-lead',
          index: 3,
          name: 'Audio Lead',
          description: 'Manages the soundstage: Dialogue, SFX, and Ambience.',
          color: '#7CE630',
          model: DEFAULT_MODELS.text,
          humanInTheLoop: true,
          position: { x: 200, y: 280 },
          subagents: [
            {
              id: 'sound-designer',
              index: 5,
              name: 'Sound Designer',
              description: 'Specifies SFX (SFX:), Ambient Noise (Ambient noise:), and Dialogue (" ").',
              color: '#50BB55',
              model: DEFAULT_MODELS.text,
              position: { x: 200, y: 430 }
            }
          ]
        }
      ]
    }
  },
  {
    id: 'strategy-coach',
    teamName: 'Strategy Coach',
    teamType: 'Strategic',
    teamDescription: 'A high-level strategic advisor for project direction and roadmap.',
    color: '#64748B',
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: true,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'visionary-advisor',
      index: 1,
      name: 'Visionary Advisor',
      description: 'Handles project direction, roadmap, and ecosystem growth strategy.',
      color: '#64748B',
      model: DEFAULT_MODELS.text,
      humanInTheLoop: true,
      position: { x: 0, y: 130 }
    }
  },
  {
    id: 'pr-agency',
    teamName: 'PR Agency',
    teamType: 'Public Relations',
    teamDescription: 'A sequential pipeline for media outreach: from strategy to press drafting.',
    color: '#E34B99',
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: false,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'pr-director',
      index: 1,
      name: 'PR Director',
      description: 'Oversees media relations, strategic communications, and brand reputation.',
      color: '#E34B99',
      model: DEFAULT_MODELS.text,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'media-strategist',
          index: 2,
          name: 'Media Strategist',
          description: 'Identifies key media outlets and manages journalist outreach.',
          color: '#E6D979',
          model: DEFAULT_MODELS.text,
          position: { x: 0, y: 260 },
          subagents: [
            {
              id: 'press-writer',
              index: 3,
              name: 'Press Writer',
              description: 'Drafts press releases and media kits based on strategic goals.',
              color: '#5E888E',
              model: DEFAULT_MODELS.text,
              position: { x: 0, y: 390 }
            }
          ]
        }
      ]
    }
  },
  {
    id: 'game-studio',
    teamName: 'Game Dev Studio',
    teamType: 'Game Development',
    teamDescription: 'A multi-disciplinary game development studio creating immersive mechanics, narrative, and level design.',
    color: '#8B5CF6',
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: true,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'game-director',
      index: 1,
      name: 'Game Director',
      description: 'Orchestrates design, mechanics, level building, and audio to deliver cohesive gameplay experiences.',
      color: '#8B5CF6',
      model: DEFAULT_MODELS.text,
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'game-designer',
          index: 2,
          name: 'Game Designer',
          description: 'Architects gameplay loops, economy systems, and player progression balancing.',
          color: '#EAB308',
          model: DEFAULT_MODELS.text,
          skillIds: ['brainstormer'],
          position: { x: -300, y: 280 }
        },
        {
          id: 'level-designer',
          index: 3,
          name: 'Level Designer',
          description: 'Builds whitebox environments, layout flows, and puzzle interactions.',
          color: '#14B8A6',
          model: DEFAULT_MODELS.text,
          skillIds: ['data-analysis'],
          position: { x: -100, y: 280 }
        },
        {
          id: 'narrative-designer',
          index: 4,
          name: 'Narrative Designer',
          description: 'Authors game lore, dialogue transcripts, quest lines, and character bibles.',
          color: '#EC4899',
          model: DEFAULT_MODELS.text,
          skillIds: ['copywriting'],
          position: { x: 100, y: 280 }
        },
        {
          id: 'game-audio-engineer',
          index: 5,
          name: 'Audio Lead',
          description: 'Arranges immersive soundscapes, ambient tracks, and sound effect trigger definitions.',
          color: '#22C55E',
          model: DEFAULT_MODELS.text,
          position: { x: 300, y: 280 }
        }
      ]
    }
  },
  {
    id: 'security-studio',
    teamName: 'Cybersecurity Swarm',
    teamType: 'Security Audit',
    teamDescription: 'A defensive and offensive cybersecurity audit team specializing in code analysis, threat modeling, and compliance.',
    color: '#EF4444',
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
    outputAutoApprove: false,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'security-architect',
      index: 1,
      name: 'Security Architect',
      description: 'Orchestrates threat modeling, designs secure patterns, and reviews systemic vulnerability remediations.',
      color: '#EF4444',
      model: DEFAULT_MODELS.text,
      humanInTheLoop: true,
      skillIds: ['critical-reviewer'],
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'penetration-tester',
          index: 2,
          name: 'Pentester',
          description: 'Audits source code for injection bugs, memory leaks, and authorization bypass vulnerabilities.',
          color: '#F97316',
          model: DEFAULT_MODELS.text,
          skillIds: ['code-review'],
          position: { x: -200, y: 280 }
        },
        {
          id: 'appsec-engineer',
          index: 3,
          name: 'AppSec Engineer',
          description: 'Secures web routes, API requests, CORS policies, and runs dependency vulnerability checks.',
          color: '#3B82F6',
          model: DEFAULT_MODELS.text,
          position: { x: 0, y: 280 }
        },
        {
          id: 'compliance-auditor',
          index: 4,
          name: 'Compliance Auditor',
          description: 'Audits deliverables against SOC2, OWASP Top 10, and ISO 27001 requirements.',
          color: '#64748B',
          model: DEFAULT_MODELS.text,
          skillIds: ['fact-checker'],
          position: { x: 200, y: 280 }
        }
      ]
    }
  }
];

export function getAgentSet(id: string, customSystems: AgenticSystem[] = []): AgenticSystem {
  const system = (
    customSystems.find((s) => s.id === id) ||
    AGENTIC_SETS.find((s) => s.id === id) ||
    AGENTIC_SETS.find((s) => s.id === DEFAULT_AGENTIC_SET_ID) ||
    AGENTIC_SETS[0]
  );

  return {
    ...system,
    outputType: 'text',
    outputModel: DEFAULT_MODELS.text,
  };
}

/**
 * Character index for a society role. An exact name wins. A role that merely
 * names someone ("Keeper on allergies") still hits that character. Anything
 * else is spread across the set so unknown roles do not all become the lead.
 */
export function agentIndexForRole(role: string | undefined, agents: { name: string; index: number }[]): number {
  if (agents.length === 0) return 0;
  const named = role?.trim().toLowerCase() ?? '';
  if (!named) return agents[0].index;
  const exact = agents.find((agent) => agent.name.toLowerCase() === named);
  if (exact) return exact.index;
  const mentioned = agents.find((agent) => named.includes(agent.name.toLowerCase()));
  if (mentioned) return mentioned.index;
  let hash = 2166136261;
  for (let i = 0; i < named.length; i += 1) {
    hash ^= named.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return agents[(hash >>> 0) % agents.length].index;
}

export function getAllAgents(system: AgenticSystem): AgentNode[] {
  const agents: AgentNode[] = [];
  const traverse = (node: AgentNode) => {
    agents.push(node);
    if (node.subagents) {
      node.subagents.forEach(traverse);
    }
  };
  traverse(system.leadAgent);
  return agents;
}

export function getAllCharacters(system: AgenticSystem): AgentNode[] {
  const userNode: AgentNode = {
    id: USER_ID,
    index: system.user.index,
    name: USER_NAME,
    color: USER_COLOR,
    model: system.user.model,
    description: 'Human user issuing commands.',
  };
  return [userNode, ...getAllAgents(system)];
}
