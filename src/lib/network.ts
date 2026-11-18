import type { Corridor, RailNode, SensorLog, TrainDef, WorkOrder, YardDef } from './types';

// Schematic national network: 3 trunk corridors (North, Central, South) with
// branches, marshalling yards at inland hubs, passenger terminals at metros.
export const NODES: RailNode[] = [
  { id: 'n-havenport', name: 'Havenport Port', code: 'HVP', type: 'freight-hub', x: 80, y: 120 },
  { id: 'n-steelcity', name: 'Steel City Yard', code: 'SCY', type: 'yard', x: 300, y: 90 },
  { id: 'n-northgate', name: 'Northgate', code: 'NGT', type: 'passenger', x: 520, y: 60 },
  { id: 'n-vale', name: 'Vale Junction', code: 'VLJ', type: 'junction', x: 700, y: 110 },
  { id: 'n-capstone', name: 'Capstone Terminal', code: 'CPT', type: 'passenger', x: 920, y: 70 },
  { id: 'c-riverside', name: 'Riverside Marshalling', code: 'RVM', type: 'yard', x: 250, y: 300 },
  { id: 'c-central', name: 'Central Station', code: 'CST', type: 'passenger', x: 470, y: 310 },
  { id: 'c-ironbridge', name: 'Ironbridge Junction', code: 'IBJ', type: 'junction', x: 680, y: 290 },
  { id: 'c-midland', name: 'Midland Freight Hub', code: 'MFH', type: 'freight-hub', x: 900, y: 250 },
  { id: 's-quarry', name: 'Quarry Siding', code: 'QYS', type: 'junction', x: 180, y: 520 },
  { id: 's-lakeside', name: 'Lakeside Terminal', code: 'LKT', type: 'passenger', x: 420, y: 560 },
  { id: 's-refinery', name: 'Refinery Wharf', code: 'RFW', type: 'freight-hub', x: 660, y: 540 },
  { id: 's-summit', name: 'Summit Yard', code: 'SMY', type: 'yard', x: 860, y: 500 },
  { id: 's-portland', name: 'Portland South', code: 'PLS', type: 'passenger', x: 960, y: 600 },
];

export const CORRIDORS: Corridor[] = [
  { id: 'c01', from: 'n-havenport', to: 'n-steelcity', distanceKm: 142, maxSpeed: 100, tracks: 2, electrified: true, baseCongestion: 46, wear: 31 },
  { id: 'c02', from: 'n-steelcity', to: 'n-northgate', distanceKm: 98, maxSpeed: 160, tracks: 2, electrified: true, baseCongestion: 58, wear: 22 },
  { id: 'c03', from: 'n-northgate', to: 'n-vale', distanceKm: 176, maxSpeed: 200, tracks: 2, electrified: true, baseCongestion: 52, wear: 18 },
  { id: 'c04', from: 'n-vale', to: 'n-capstone', distanceKm: 120, maxSpeed: 200, tracks: 2, electrified: true, baseCongestion: 39, wear: 14 },
  { id: 'c05', from: 'n-havenport', to: 'c-riverside', distanceKm: 165, maxSpeed: 80, tracks: 1, electrified: false, baseCongestion: 71, wear: 64 },
  { id: 'c06', from: 'c-riverside', to: 'c-central', distanceKm: 132, maxSpeed: 140, tracks: 2, electrified: true, baseCongestion: 63, wear: 35 },
  { id: 'c07', from: 'c-central', to: 'c-ironbridge', distanceKm: 118, maxSpeed: 160, tracks: 2, electrified: true, baseCongestion: 77, wear: 42 },
  { id: 'c08', from: 'c-ironbridge', to: 'c-midland', distanceKm: 145, maxSpeed: 120, tracks: 2, electrified: false, baseCongestion: 55, wear: 29 },
  { id: 'c09', from: 'n-steelcity', to: 'c-riverside', distanceKm: 154, maxSpeed: 100, tracks: 1, electrified: false, baseCongestion: 68, wear: 58 },
  { id: 'c10', from: 'c-riverside', to: 's-quarry', distanceKm: 187, maxSpeed: 80, tracks: 1, electrified: false, baseCongestion: 44, wear: 71 },
  { id: 'c11', from: 's-quarry', to: 's-lakeside', distanceKm: 143, maxSpeed: 120, tracks: 1, electrified: false, baseCongestion: 38, wear: 47 },
  { id: 'c12', from: 's-lakeside', to: 'c-ironbridge', distanceKm: 158, maxSpeed: 140, tracks: 2, electrified: true, baseCongestion: 49, wear: 27 },
  { id: 'c13', from: 'c-ironbridge', to: 's-refinery', distanceKm: 176, maxSpeed: 100, tracks: 1, electrified: false, baseCongestion: 59, wear: 55 },
  { id: 'c14', from: 's-refinery', to: 's-summit', distanceKm: 128, maxSpeed: 100, tracks: 1, electrified: true, baseCongestion: 51, wear: 38 },
  { id: 'c15', from: 's-summit', to: 's-portland', distanceKm: 94, maxSpeed: 160, tracks: 2, electrified: true, baseCongestion: 42, wear: 19 },
  { id: 'c16', from: 'n-vale', to: 'c-ironbridge', distanceKm: 137, maxSpeed: 180, tracks: 2, electrified: true, baseCongestion: 61, wear: 24 },
  { id: 'c17', from: 'c-midland', to: 's-summit', distanceKm: 149, maxSpeed: 120, tracks: 2, electrified: false, baseCongestion: 48, wear: 33 },
  { id: 'c18', from: 'n-vale', to: 'c-midland', distanceKm: 111, maxSpeed: 160, tracks: 2, electrified: true, baseCongestion: 57, wear: 21 },
  { id: 'c19', from: 'c-central', to: 'n-vale', distanceKm: 126, maxSpeed: 180, tracks: 2, electrified: true, baseCongestion: 54, wear: 23 },
];

export const TRAINS: TrainDef[] = [
  { id: 'IC-2201', type: 'intercity', route: ['n-capstone', 'n-vale', 'n-northgate', 'n-steelcity', 'n-havenport'], locoModel: 'Class 90 "Intrepid"', locoHp: 5200, maxSpeed: 200, cars: 12, tonnage: 0, cargo: 'Passengers (intercity)', scheduledDeparture: 0 },
  { id: 'EX-1104', type: 'express', route: ['n-capstone', 'n-vale', 'c-ironbridge', 'c-central'], locoModel: 'Velaro-E High-Speed Set', locoHp: 8900, maxSpeed: 230, cars: 8, tonnage: 0, cargo: 'Passengers (express)', scheduledDeparture: 15 },
  { id: 'RG-3308', type: 'regional', route: ['s-portland', 's-summit', 's-refinery', 'c-ironbridge', 'c-central'], locoModel: 'Class 158 Sprinter', locoHp: 1900, maxSpeed: 145, cars: 3, tonnage: 0, cargo: 'Passengers (regional)', scheduledDeparture: 40 },
  { id: 'RG-3312', type: 'regional', route: ['s-lakeside', 's-quarry', 'c-riverside', 'c-central'], locoModel: 'Class 158 Sprinter', locoHp: 1900, maxSpeed: 145, cars: 2, tonnage: 0, cargo: 'Passengers (regional)', scheduledDeparture: 65 },
  { id: 'IM-5501', type: 'intermodal', route: ['n-havenport', 'n-steelcity', 'n-northgate', 'n-vale', 'c-ironbridge', 'c-midland'], locoModel: 'ES64U "Taurus" Twin', locoHp: 6400, maxSpeed: 120, cars: 32, tonnage: 2100, cargo: '40ft ISO containers', scheduledDeparture: 25 },
  { id: 'IM-5502', type: 'intermodal', route: ['s-refinery', 'c-ironbridge', 'c-central', 'c-riverside', 'n-havenport'], locoModel: 'Class 66 Heavy Freight', locoHp: 3400, maxSpeed: 100, cars: 28, tonnage: 1850, cargo: 'Tanktainers / chemicals', scheduledDeparture: 80 },
  { id: 'BK-7701', type: 'bulk', route: ['s-quarry', 'c-riverside', 'n-steelcity', 'n-northgate'], locoModel: 'Class 66 Heavy Freight', locoHp: 3400, maxSpeed: 80, cars: 40, tonnage: 3400, cargo: 'Aggregate / ballast', scheduledDeparture: 55 },
  { id: 'BK-7702', type: 'bulk', route: ['n-havenport', 'c-riverside', 'c-central', 'c-ironbridge', 's-refinery'], locoModel: 'ES64U "Taurus" Twin', locoHp: 6400, maxSpeed: 90, cars: 36, tonnage: 3100, cargo: 'Grain hopper', scheduledDeparture: 5 },
  { id: 'MF-8801', type: 'manifest', route: ['c-midland', 'n-vale', 'n-northgate', 'n-steelcity'], locoModel: 'Class 70 PowerHaul', locoHp: 3750, maxSpeed: 110, cars: 24, tonnage: 1650, cargo: 'Mixed manifest', scheduledDeparture: 95 },
  { id: 'MF-8802', type: 'manifest', route: ['c-central', 'c-ironbridge', 's-refinery', 's-summit', 's-portland'], locoModel: 'Class 70 PowerHaul', locoHp: 3750, maxSpeed: 110, cars: 20, tonnage: 1400, cargo: 'Automotive + steel coil', scheduledDeparture: 120 },
  { id: 'EX-1106', type: 'express', route: ['c-central', 'n-vale', 'n-capstone'], locoModel: 'Velaro-E High-Speed Set', locoHp: 8900, maxSpeed: 230, cars: 8, tonnage: 0, cargo: 'Passengers (express)', scheduledDeparture: 150 },
  { id: 'IM-5503', type: 'intermodal', route: ['n-steelcity', 'c-riverside', 'c-central', 'c-ironbridge', 's-refinery', 's-summit'], locoModel: 'ES64U "Taurus" Twin', locoHp: 6400, maxSpeed: 120, cars: 30, tonnage: 1950, cargo: 'Refrigerated trailers', scheduledDeparture: 175 },
];

export const YARDS: YardDef[] = [
  { id: 'y-scy', nodeId: 'n-steelcity', bays: 14, inbound: 38, outbound: 35, dwellH: 6.8, berthUtil: 0.82, intermodal: true, wagonsOnHand: 412, wagonDemand: 380 },
  { id: 'y-rvm', nodeId: 'c-riverside', bays: 18, inbound: 46, outbound: 41, dwellH: 8.9, berthUtil: 0.94, intermodal: true, wagonsOnHand: 265, wagonDemand: 410 },
  { id: 'y-smh', nodeId: 's-summit', bays: 11, inbound: 29, outbound: 27, dwellH: 5.2, berthUtil: 0.68, intermodal: false, wagonsOnHand: 348, wagonDemand: 260 },
];

export const SENSOR_LOGS: SensorLog[] = [
  { id: 's1', corridorId: 'c05', chainageKm: 41.2, sensor: 'Track Geometry', reading: 'Cross-level error 11.2mm over 18m chord (limit 9.0mm)', severity: 'critical', predictedFailure: 'Speed restriction 60kph within 6 days', confidence: 0.91 },
  { id: 's2', corridorId: 'c05', chainageKm: 78.5, sensor: 'Acoustic Array', reading: 'Broadband rail-crack signature, 2.1kHz resonance peak', severity: 'advisory', predictedFailure: 'Transverse fatigue crack, 30-day window', confidence: 0.74 },
  { id: 's3', corridorId: 'c07', chainageKm: 12.8, sensor: 'Switch Motor', reading: 'Point machine #7 stall current +34% over baseline', severity: 'advisory', predictedFailure: 'Switch motor degradation, 45-day window', confidence: 0.68 },
  { id: 's4', corridorId: 'c07', chainageKm: 96.4, sensor: 'Wheel-Impact (WILD)', reading: 'Wheel impact load 2.41x mean on axle 6, uptrain IM-5501', severity: 'critical', predictedFailure: 'Axle bearing spall risk within 72h', confidence: 0.88 },
  { id: 's5', corridorId: 'c10', chainageKm: 133.0, sensor: 'Track Geometry', reading: 'Longitudinal level degradation Class C, t/365 = 4.1', severity: 'advisory', predictedFailure: 'Tamping required before Q3', confidence: 0.77 },
  { id: 's6', corridorId: 'c10', chainageKm: 55.7, sensor: 'Acoustic Array', reading: 'Fishplate crack tone 1.6kHz, both rails', severity: 'critical', predictedFailure: 'Joint failure / broken rail in 12 days', confidence: 0.83 },
  { id: 's7', corridorId: 'c13', chainageKm: 101.3, sensor: 'Wheel-Impact (WILD)', reading: 'Hunting oscillation, 4.2Hz yaw on bogie 2', severity: 'advisory', predictedFailure: 'Suspension wear — wheel reprofiling', confidence: 0.71 },
  { id: 's8', corridorId: 'c01', chainageKm: 22.0, sensor: 'Switch Motor', reading: 'Friction coefficient within spec', severity: 'nominal', predictedFailure: '—', confidence: 0.99 },
  { id: 's9', corridorId: 'c03', chainageKm: 88.1, sensor: 'Track Geometry', reading: 'Gauge 1434.8mm (in tolerance)', severity: 'nominal', predictedFailure: '—', confidence: 0.98 },
  { id: 's10', corridorId: 'c14', chainageKm: 64.2, sensor: 'Axle Bearing', reading: 'Bearing temperature +8C over 24h trend, uptrain IM-5503', severity: 'advisory', predictedFailure: 'Thermal runaway risk 10-14 days', confidence: 0.69 },
  { id: 's11', corridorId: 'c13', chainageKm: 30.6, sensor: 'Acoustic Array', reading: 'Sustained 3.4kHz tone correlated with wheel flat', severity: 'advisory', predictedFailure: 'Wheel flat growth on BK-7702 set', confidence: 0.72 },
  { id: 's12', corridorId: 'c17', chainageKm: 118.9, sensor: 'Track Geometry', reading: 'Twist error 7.4mm/6.2m approaching limit', severity: 'advisory', predictedFailure: 'Machine tamping within 21 days', confidence: 0.8 },
];

export const WORK_ORDERS: WorkOrder[] = [
  { id: 'WO-4417', corridorId: 'c05', task: 'Replace transverse-fatigue rail section 41.2km', crew: 'Track Crew T-3', durationH: 6, priority: 'P1', status: 'unscheduled' },
  { id: 'WO-4418', corridorId: 'c07', task: 'Rebuild point machine #7, renew stall-current drive belt', crew: 'Signals Crew S-1', durationH: 4, priority: 'P1', status: 'unscheduled' },
  { id: 'WO-4419', corridorId: 'c10', task: 'Tamp + lining pass 55-134km, restore Class B geometry', crew: 'Track Crew T-7', durationH: 9, priority: 'P2', status: 'unscheduled' },
  { id: 'WO-4420', corridorId: 'c10', task: 'Replace cracked fishplates at 55.7km, re-torque joints', crew: 'Track Crew T-2', durationH: 3, priority: 'P1', status: 'unscheduled' },
  { id: 'WO-4421', corridorId: 'c14', task: 'Axle bearing changeout, IM-5503 rake (depot)', crew: 'Rolling Stock Crew R-4', durationH: 5, priority: 'P2', status: 'unscheduled' },
  { id: 'WO-4422', corridorId: 'c13', task: 'Wheel reprofiling campaign — BK-7702 rakes', crew: 'Rolling Stock Crew R-1', durationH: 7, priority: 'P3', status: 'unscheduled' },
];
