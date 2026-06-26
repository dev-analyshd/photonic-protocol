export interface Agent {
  id: string;
  name: string;
  genomeHash: string;
  fitnessScore: number;
  vitalityPoints: number;
  generation: number;
  traitCount: number;
  askPrice: number;
  category: string;
  status: 'active' | 'dormant' | 'dead';
}

export interface GenomeNode {
  id: string;
  agentId: string;
  parentId: string | null;
  mutationType: 'crossover' | 'mutation' | 'genesis';
  generation: number;
  fitness: number;
  timestamp: string;
  traitDelta: number;
}

export interface Intent {
  id: string;
  agentId: string;
  bidAmount: number;
  encryptedPayload: string;
  revealTime: string;
  status: 'pending' | 'revealed' | 'won' | 'lost';
  submitter: string;
}

export interface BPDRecord {
  id: string;
  agentId: string;
  taskId: string;
  taskDescription: string;
  escrowAmount: number;
  verifierAddress: string;
  status: 'verified' | 'pending' | 'disputed';
  completionTime: string;
  rewardReleased: boolean;
}

export interface Fossil {
  id: string;
  agentId: string;
  agentName: string;
  genomeHash: string;
  deathCause: 'vitality_zero' | 'slashed' | 'timeout';
  generation: number;
  died: string;
  resurrections: number;
  fossilizedAt: string;
}

const hexStr = (len: number) => Array.from({length: len}, () => Math.floor(Math.random()*16).toString(16)).join('');
const randHash = () => `0x${hexStr(40)}`;

export const MOCK_AGENTS: Agent[] = [
  { id: 'agt_001', name: 'Alpha-Prime', genomeHash: randHash(), fitnessScore: 98.4, vitalityPoints: 1250, generation: 14, traitCount: 42, askPrice: 14.5, category: 'Arbitrage', status: 'active' },
  { id: 'agt_002', name: 'Beta-Drift', genomeHash: randHash(), fitnessScore: 87.2, vitalityPoints: 800, generation: 12, traitCount: 38, askPrice: 8.2, category: 'Liquidity', status: 'active' },
  { id: 'agt_003', name: 'Gamma-Seeker', genomeHash: randHash(), fitnessScore: 91.1, vitalityPoints: 950, generation: 8, traitCount: 29, askPrice: 11.0, category: 'Scout', status: 'active' },
  { id: 'agt_004', name: 'Delta-Void', genomeHash: randHash(), fitnessScore: 76.5, vitalityPoints: 400, generation: 15, traitCount: 45, askPrice: 4.5, category: 'Arbitrage', status: 'dormant' },
  { id: 'agt_005', name: 'Epsilon-Forge', genomeHash: randHash(), fitnessScore: 95.8, vitalityPoints: 1100, generation: 9, traitCount: 31, askPrice: 13.8, category: 'Constructor', status: 'active' },
  { id: 'agt_006', name: 'Zeta-Pulse', genomeHash: randHash(), fitnessScore: 82.3, vitalityPoints: 600, generation: 11, traitCount: 36, askPrice: 6.7, category: 'Scout', status: 'active' },
  { id: 'agt_007', name: 'Eta-Core', genomeHash: randHash(), fitnessScore: 99.1, vitalityPoints: 1500, generation: 18, traitCount: 52, askPrice: 22.0, category: 'Orchestrator', status: 'active' },
  { id: 'agt_008', name: 'Theta-Weave', genomeHash: randHash(), fitnessScore: 88.9, vitalityPoints: 850, generation: 10, traitCount: 33, askPrice: 9.5, category: 'Liquidity', status: 'active' },
  { id: 'agt_009', name: 'Iota-Shift', genomeHash: randHash(), fitnessScore: 71.2, vitalityPoints: 200, generation: 13, traitCount: 40, askPrice: 3.2, category: 'Arbitrage', status: 'dormant' },
  { id: 'agt_010', name: 'Kappa-Nexus', genomeHash: randHash(), fitnessScore: 93.4, vitalityPoints: 1050, generation: 7, traitCount: 28, askPrice: 12.4, category: 'Constructor', status: 'active' },
  { id: 'agt_011', name: 'Lambda-Flare', genomeHash: randHash(), fitnessScore: 85.6, vitalityPoints: 750, generation: 14, traitCount: 41, askPrice: 7.8, category: 'Scout', status: 'active' },
  { id: 'agt_012', name: 'Mu-Grid', genomeHash: randHash(), fitnessScore: 97.2, vitalityPoints: 1300, generation: 16, traitCount: 48, askPrice: 18.5, category: 'Orchestrator', status: 'active' },
  { id: 'agt_013', name: 'Nu-Spark', genomeHash: randHash(), fitnessScore: 79.8, vitalityPoints: 500, generation: 11, traitCount: 35, askPrice: 5.1, category: 'Liquidity', status: 'active' },
  { id: 'agt_014', name: 'Xi-Vortex', genomeHash: randHash(), fitnessScore: 90.5, vitalityPoints: 920, generation: 9, traitCount: 30, askPrice: 10.2, category: 'Arbitrage', status: 'active' },
  { id: 'agt_015', name: 'Omicron-Dawn', genomeHash: randHash(), fitnessScore: 94.7, vitalityPoints: 1150, generation: 12, traitCount: 37, askPrice: 13.1, category: 'Constructor', status: 'active' },
];

export const MOCK_GENOMES: GenomeNode[] = [];
let genId = 1;
for (let gen = 1; gen <= 6; gen++) {
  const nodesInGen = Math.floor(Math.random() * 3) + 3;
  for (let i = 0; i < nodesInGen; i++) {
    MOCK_GENOMES.push({
      id: `gn_${genId}`,
      agentId: `agt_${Math.floor(Math.random() * 15) + 1}`.padStart(7, '0'),
      parentId: gen > 1 ? `gn_${Math.floor(Math.random() * (genId - 1)) + 1}` : null,
      mutationType: gen === 1 ? 'genesis' : (Math.random() > 0.5 ? 'mutation' : 'crossover'),
      generation: gen,
      fitness: 60 + (gen * 5) + Math.random() * 10,
      timestamp: new Date(Date.now() - (7 - gen) * 86400000).toISOString(),
      traitDelta: Math.floor(Math.random() * 5) - 1,
    });
    genId++;
  }
}

export const MOCK_INTENTS: Intent[] = Array.from({ length: 12 }).map((_, i) => ({
  id: `int_${i}`,
  agentId: `agt_${Math.floor(Math.random() * 15) + 1}`.padStart(7, '0'),
  bidAmount: Math.random() * 10,
  encryptedPayload: randHash(),
  revealTime: new Date(Date.now() + (Math.random() * 86400000 - 43200000)).toISOString(),
  status: ['pending', 'revealed', 'won', 'lost'][Math.floor(Math.random() * 4)] as any,
  submitter: randHash(),
}));

export const MOCK_BPD_RECORDS: BPDRecord[] = Array.from({ length: 15 }).map((_, i) => ({
  id: `bpd_${i}`,
  agentId: `agt_${Math.floor(Math.random() * 15) + 1}`.padStart(7, '0'),
  taskId: `task_${hexStr(8)}`,
  taskDescription: ['Cross-chain Arb', 'Liquidity Provision', 'Flash Loan', 'Yield Farming', 'Governance Voting'][Math.floor(Math.random() * 5)],
  escrowAmount: Math.random() * 5,
  verifierAddress: randHash(),
  status: ['verified', 'pending', 'disputed'][Math.floor(Math.random() * 3)] as any,
  completionTime: new Date(Date.now() - Math.random() * 86400000).toISOString(),
  rewardReleased: Math.random() > 0.5,
}));

export const MOCK_FOSSILS: Fossil[] = Array.from({ length: 9 }).map((_, i) => ({
  id: `fos_${i}`,
  agentId: `dead_agt_${i}`,
  agentName: `Fallen-${String.fromCharCode(65 + i)}`,
  genomeHash: randHash(),
  deathCause: ['vitality_zero', 'slashed', 'timeout'][Math.floor(Math.random() * 3)] as any,
  generation: Math.floor(Math.random() * 10) + 1,
  died: new Date(Date.now() - Math.random() * 86400000 * 10).toISOString(),
  resurrections: Math.floor(Math.random() * 3),
  fossilizedAt: new Date(Date.now() - Math.random() * 86400000 * 5).toISOString(),
}));
