// What a world with its own game (rides, a rocket, a restaurant) plugs into main.ts. The island and the
// obbies don't have one. Each world's activity is made when its level loads and disposed when you leave.
import type * as THREE from 'three';
import type { Sim } from '../sim/physics';
import type { Save } from '../sim/shop';
import type { V3 } from '../sim/types';
import type { Rig } from '../view/avatar';
import type { UI } from '../ui/ui';

/** A big context button ("🎢 Ride!"). */
export interface Action {
  label: string;
  run: () => void;
  color?: string;
}

/** The normal follow camera's angles (dragging changes them), for activities that want to orbit something. */
export interface CamView {
  yaw: number;
  pitch: number;
  dist: number;
}

export interface WorldCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ui: UI;
  save: Save;
  sim: () => Sim;
  /** Give coins (with a sound), and save. */
  addCoins(n: number): void;
  /** Mark a world finished (a ⭐ on its doorway), and save. */
  complete(id: string): void;
  persist(): void;
  setSky(top: string, horizon: string): void;
  confetti(at: V3): void;
}

export interface Activity {
  /** Every frame while playing (not while paused). */
  update(dt: number, t: number): void;
  /** The context buttons to show right now. */
  actions(): Action[];
  /** True while you can't walk (riding, building, flying). */
  locked(): boolean;
  /** Place the character yourself (sitting in a ride); return true if you did. */
  pose(rig: Rig, t: number): boolean;
  /** Place the camera yourself; return true if you did. */
  camera(cam: THREE.PerspectiveCamera, view: CamView, dt: number): boolean;
  dispose(): void;
}
