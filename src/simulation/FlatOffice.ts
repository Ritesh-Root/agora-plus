import { getAllAgents } from '../data/agents';
import { useCoreStore } from '../integration/store/coreStore';
import { getActiveAgentSet } from '../integration/store/teamStore';
import { Engine } from './core/Engine';

interface FlatAgent {
  name: string;
  color: string;
  x: number;
  y: number;
  desk: number;
}

/** Top-down office used when neither WebGPU nor WebGL2 can start. */
export class FlatOffice {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private agents: FlatAgent[] = [];
  private running = false;

  constructor(private container: HTMLElement, private engine: Engine) {
    this.canvas = document.createElement('canvas');
    this.canvas.dataset.testid = 'office-canvas';
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;background:#efebe0;';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is unavailable');
    this.ctx = ctx;
    container.appendChild(this.canvas);
    const team = getAllAgents(getActiveAgentSet());
    this.agents = team.map((agent, index) => ({
      name: agent.name,
      color: agent.color,
      x: 80 + index * 28,
      y: 80,
      desk: index,
    }));
  }

  start() {
    this.running = true;
    this.resize();
    const tick = () => {
      if (!this.running) return;
      this.engine.noteFrame();
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
  }

  private resize() {
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width));
    this.canvas.height = Math.max(1, Math.floor(rect.height));
  }

  private draw() {
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    const tasks = useCoreStore.getState().tasks;
    const time = performance.now() / 1000;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#efebe0';
    ctx.fillRect(0, 0, width, height);

    const floor = { x: 36, y: 36, w: width - 72, h: height - 72 };
    ctx.fillStyle = '#fcfaf4';
    ctx.strokeStyle = '#17150f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(floor.x, floor.y, floor.w, floor.h, 18);
    ctx.fill();
    ctx.stroke();

    this.agents.forEach((agent, index) => {
      const working = tasks.some((task) => task.assignedAgentId === index + 1 && task.status === 'in_progress');
      const deskX = floor.x + 48 + (index % 4) * 70;
      const deskY = floor.y + 48 + Math.floor(index / 4) * 78;
      ctx.fillStyle = '#f4d35e';
      ctx.fillRect(deskX, deskY, 46, 28);
      const wander = working ? 0 : Math.sin(time + index) * 18;
      agent.x += ((deskX + 23 + wander) - agent.x) * 0.04;
      agent.y += ((deskY - 16) - agent.y) * 0.04;
      ctx.beginPath();
      ctx.fillStyle = agent.color || '#17150f';
      ctx.arc(agent.x, agent.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#17150f';
      ctx.font = '600 11px "Schibsted Grotesk", system-ui, sans-serif';
      ctx.fillText(agent.name, agent.x + 14, agent.y + 4);
    });

    ctx.fillStyle = '#17150f';
    ctx.font = '600 12px "Schibsted Grotesk", system-ui, sans-serif';
    const open = tasks.filter((task) => task.status !== 'done').length;
    ctx.fillText(open ? `${open} open tasks` : 'Office is quiet', floor.x + 16, floor.y + floor.h - 16);
  }
}
