export type NodeType = 'freight-hub' | 'yard' | 'passenger' | 'junction';

export interface RailNode {
  id: string;
  name: string;
  code: string;
  type: NodeType;
  x: number; // schematic coordinates 0..1000
  y: number; // schematic coordinates 0..640
}

export interface Corridor {
  id: string;
  from: string;
  to: string;
  distanceKm: number;
  maxSpeed: number; // kph
  tracks: 1 | 2;
  electrified: boolean;
  baseCongestion: number; // 0..100
  wear: number; // 0..100 infrastructure wear index
}

export type TrainType = 'express' | 'intercity' | 'regional' | 'intermodal' | 'bulk' | 'manifest';

export interface TrainDef {
  id: string;
  type: TrainType;
  route: string[]; // node ids
  locoModel: string;
  locoHp: number;
  maxSpeed: number; // kph
  cars: number; // wagons or passenger cars
  tonnage: number; // gross tonnes (0 for passenger)
  cargo: string;
  scheduledDeparture: number; // minutes from midnight
}

export interface TrainEdge extends Corridor {}

export interface TrainState extends TrainDef {
  _edges: TrainEdge[];
  edgeIdx: number; // index into resolved edge list of route
  progressKm: number;
  speed: number; // current kph
  delayMin: number;
  riskPct: number;
  status: 'running' | 'held' | 'diverted' | 'arrival';
  loadPct: number;
  rerouted: boolean;
  totalRouteKm: number;
  distanceCoveredKm: number;
}

export interface Obstruction {
  corridorId: string;
  kind: 'track-blockage' | 'switch-fault' | 'signal-fault';
  label: string;
  sinceTick: number;
}

export interface DispatchEventRow {
  id: string;
  kind: string;
  severity: string;
  message: string;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface SensorLog {
  id: string;
  corridorId: string;
  chainageKm: number;
  sensor: 'Acoustic Array' | 'Wheel-Impact (WILD)' | 'Track Geometry' | 'Switch Motor' | 'Axle Bearing';
  reading: string;
  severity: 'nominal' | 'advisory' | 'critical';
  predictedFailure: string;
  confidence: number;
}

export interface WorkOrder {
  id: string;
  corridorId: string;
  task: string;
  crew: string;
  durationH: number;
  priority: 'P1' | 'P2' | 'P3';
  status: 'unscheduled' | 'scheduled';
  window?: string;
}

export interface YardDef {
  id: string;
  nodeId: string;
  bays: number;
  inbound: number; // trains/day
  outbound: number;
  dwellH: number;
  berthUtil: number; // 0..1
  intermodal: boolean;
  wagonsOnHand: number;
  wagonDemand: number;
}

export type Overlay = 'congestion' | 'freight' | 'wear';
export type ViewKey = 'map' | 'prediction' | 'fleet' | 'maintenance' | 'yard';
