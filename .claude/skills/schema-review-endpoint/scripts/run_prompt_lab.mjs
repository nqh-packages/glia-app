#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../../convex/_generated/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../../../../");

const NAME_POOL = [
  "Avery",
  "Jordan",
  "Taylor",
  "Casey",
  "Riley",
  "Morgan",
  "Parker",
  "Quinn",
  "Skyler",
  "Emerson",
  "Harper",
  "Finley"
];

const SCENARIOS = {
  polarized: {
    topic: "Should the building hire an overnight security guard?",
    description: "Residents are deciding whether to add overnight staffing after recent safety incidents.",
    mix: { yes: 0.45, neutral: 0.1, no: 0.45 },
    reasonPools: {
      yes: [
        "Recent thefts make the building feel unsafe after dark.",
        "A visible overnight guard would deter break-ins and package theft.",
        "Residents need a stronger response than just more cameras."
      ],
      neutral: [
        "A pilot might work, but we need cost estimates and incident data first.",
        "I want better safety, but the proposal needs a defined trial period.",
        "We should compare a guard with cheaper alternatives before deciding."
      ],
      no: [
        "The extra fee would hurt residents already stretched on housing costs.",
        "A guard sounds expensive compared with targeted upgrades to lighting and access control.",
        "This proposal feels reactive without proving it will solve the problem."
      ]
    }
  },
  consensus: {
    topic: "Should the building convert the unused lobby room into a package room?",
    description: "Management wants a resident vote on using spare lobby space for secure package storage.",
    mix: { yes: 0.7, neutral: 0.2, no: 0.1 },
    reasonPools: {
      yes: [
        "A package room would solve missed deliveries and clutter in the lobby.",
        "This is a practical use of a room that currently sits empty.",
        "Secure storage would reduce loss without adding much complexity."
      ],
      neutral: [
        "I like the idea if access control and hours are clearly defined.",
        "It sounds useful, but we need a plan for oversized deliveries.",
        "I support it in principle, though maintenance costs should be capped."
      ],
      no: [
        "The room could be more valuable as shared community space.",
        "I am not convinced package volume justifies dedicating the room full-time.",
        "This may create management overhead that residents are underestimating."
      ]
    }
  },
  nuanced: {
    topic: "Should the neighborhood close the main street to cars on weekends?",
    description: "The district is considering a weekend pedestrian zone for markets, families, and local businesses.",
    mix: { yes: 0.35, neutral: 0.35, no: 0.3 },
    reasonPools: {
      yes: [
        "A pedestrian zone would make the area safer and more welcoming for families.",
        "Weekend foot traffic could help cafes and small shops.",
        "Less traffic would improve air quality and the experience of public events."
      ],
      neutral: [
        "I need to see a traffic diversion plan before supporting it.",
        "The idea is promising, but delivery access and disability access need detail.",
        "A limited trial with clear metrics would be the best next step."
      ],
      no: [
        "Drivers will spill into nearby streets and create new congestion.",
        "Some businesses depend on easy car access for pickups and quick errands.",
        "This could be disruptive if transit alternatives are not improved first."
      ]
    }
  }
};

function parseArgs(argv) {
  const options = {
    scenario: "polarized",
    participants: 8,
    seed: "glia-prompt-lab",
    timeoutMs: 90000,
    pollMs: 1500,
    envFile: path.join(projectRoot, ".env.local"),
    output: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--scenario" && next) {
      options.scenario = next;
      index += 1;
    } else if (arg === "--participants" && next) {
      options.participants = Number(next);
      index += 1;
    } else if (arg === "--seed" && next) {
      options.seed = next;
      index += 1;
    } else if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
    } else if (arg === "--poll-ms" && next) {
      options.pollMs = Number(next);
      index += 1;
    } else if (arg === "--env-file" && next) {
      options.envFile = path.resolve(next);
      index += 1;
    } else if (arg === "--output" && next) {
      options.output = path.resolve(next);
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!SCENARIOS[options.scenario]) {
    throw new Error(
      `Unknown scenario "${options.scenario}". Use one of: ${Object.keys(SCENARIOS).join(", ")}`
    );
  }

  if (!Number.isInteger(options.participants) || options.participants < 2) {
    throw new Error("--participants must be an integer >= 2.");
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  node .claude/skills/schema-review-endpoint/scripts/run_prompt_lab.mjs [options]

Options:
  --scenario polarized|consensus|nuanced
  --participants <count>   Total participants including host. Default: 8
  --seed <value>           Deterministic seed string. Default: glia-prompt-lab
  --timeout-ms <ms>        Max wait for analysis. Default: 90000
  --poll-ms <ms>           Poll interval while waiting. Default: 1500
  --env-file <path>        .env file with VITE_CONVEX_URL. Default: .env.local
  --output <path>          Optional JSON file for the full seeded case + result
`);
}

function parseEnv(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    values[key] = value;
  }
  return values;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function shuffle(random, values) {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function buildChoicePlan(totalParticipants, mix) {
  const entries = Object.entries(mix);
  const counts = {};
  let assigned = 0;

  for (const [choice, weight] of entries) {
    const count = Math.floor(totalParticipants * weight);
    counts[choice] = count;
    assigned += count;
  }

  const sortedByWeight = [...entries].sort((left, right) => right[1] - left[1]);
  let remaining = totalParticipants - assigned;
  let index = 0;
  while (remaining > 0) {
    const [choice] = sortedByWeight[index % sortedByWeight.length];
    counts[choice] += 1;
    remaining -= 1;
    index += 1;
  }

  return Object.entries(counts).flatMap(([choice, count]) =>
    Array.from({ length: count }, () => choice)
  );
}

function buildResponseReason(random, scenario, choice) {
  const openers = [
    "I think",
    "From my perspective",
    "For me",
    "My main concern is that",
    "What stands out to me is"
  ];
  return `${pick(random, openers)} ${pick(random, scenario.reasonPools[choice]).toLowerCase()}`;
}

function inferReactionKind(voterChoice, responseChoice, random) {
  if (voterChoice === responseChoice) {
    return weightedChoice(random, [
      ["yes", 0.72],
      ["neutral", 0.2],
      ["no", 0.08]
    ]);
  }

  if (voterChoice === "neutral" || responseChoice === "neutral") {
    return weightedChoice(random, [
      ["yes", 0.22],
      ["neutral", 0.56],
      ["no", 0.22]
    ]);
  }

  return weightedChoice(random, [
    ["yes", 0.08],
    ["neutral", 0.2],
    ["no", 0.72]
  ]);
}

function weightedChoice(random, pairs) {
  const roll = random();
  let cumulative = 0;
  for (const [value, weight] of pairs) {
    cumulative += weight;
    if (roll <= cumulative) {
      return value;
    }
  }
  return pairs[pairs.length - 1][0];
}

function buildReactionReason(random, kind, responseChoice) {
  const reasonMap = {
    yes: [
      "This lines up with the practical reality on the ground.",
      "This feels like the clearest version of the trade-off.",
      "I agree with the way this balances urgency and feasibility."
    ],
    neutral: [
      "I partially agree but think more detail is needed.",
      "This is useful context even if I would frame it differently.",
      "There is nuance here that should stay in the final synthesis."
    ],
    no: [
      "This overstates the benefits and skips the downside.",
      "I do not think this addresses the main constraint.",
      "This would push the decision too far in one direction."
    ]
  };

  const qualifier =
    responseChoice === "neutral" ? " It still adds useful context." : "";
  return `${pick(random, reasonMap[kind])}${qualifier}`;
}

function generateCase(options) {
  const scenario = SCENARIOS[options.scenario];
  const random = mulberry32(hashString(`${options.seed}:${options.scenario}:${options.participants}`));
  const names = shuffle(random, NAME_POOL).slice(0, options.participants);
  const choices = shuffle(random, buildChoicePlan(options.participants, scenario.mix));

  const participants = names.map((name, index) => ({
    name,
    role: index === 0 ? "host" : "participant",
    choice: choices[index],
    reason: buildResponseReason(random, scenario, choices[index])
  }));

  const reactions = [];
  for (let targetIndex = 0; targetIndex < participants.length; targetIndex += 1) {
    for (let voterIndex = 0; voterIndex < participants.length; voterIndex += 1) {
      if (targetIndex === voterIndex) {
        continue;
      }

      if (random() > 0.72) {
        continue;
      }

      const kind = inferReactionKind(
        participants[voterIndex].choice,
        participants[targetIndex].choice,
        random
      );

      reactions.push({
        voterIndex,
        targetIndex,
        kind,
        reason:
          random() > 0.65
            ? buildReactionReason(random, kind, participants[targetIndex].choice)
            : undefined
      });
    }
  }

  return {
    scenario: options.scenario,
    room: {
      hostName: participants[0].name,
      topic: scenario.topic,
      description: scenario.description,
      language: "en"
    },
    participants,
    reactions
  };
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loadClient(envFile) {
  const envPath = path.resolve(envFile);
  const env = parseEnv(await fs.readFile(envPath, "utf8"));
  const convexUrl = env.VITE_CONVEX_URL || process.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    throw new Error(`Missing VITE_CONVEX_URL in ${envPath}.`);
  }

  return {
    env,
    client: new ConvexHttpClient(convexUrl)
  };
}

async function seedAndAnalyze(client, generated, options) {
  const room = await client.mutation(api.rooms.createRoom, {
    hostName: generated.room.hostName,
    topic: generated.room.topic,
    description: generated.room.description,
    capacityMode: "unlimited",
    analysisMode: "manual",
    language: generated.room.language
  });

  const sessions = [
    {
      name: generated.participants[0].name,
      role: "host",
      joinToken: room.joinToken
    }
  ];

  for (let index = 1; index < generated.participants.length; index += 1) {
    const participant = generated.participants[index];
    const joined = await client.mutation(api.rooms.joinRoom, {
      code: room.code,
      name: participant.name
    });
    sessions.push({
      name: participant.name,
      role: "participant",
      joinToken: joined.joinToken
    });
  }

  const opinionIds = [];
  for (let index = 0; index < generated.participants.length; index += 1) {
    const participant = generated.participants[index];
    const session = sessions[index];
    const submitted = await client.mutation(api.opinions.submitOpinion, {
      roomId: room.roomId,
      joinToken: session.joinToken,
      choice: participant.choice,
      reason: participant.reason,
      attachmentIds: []
    });
    opinionIds.push(submitted.opinionId);
  }

  for (const reaction of generated.reactions) {
    const voter = sessions[reaction.voterIndex];
    await client.mutation(api.votes.castReaction, {
      roomId: room.roomId,
      joinToken: voter.joinToken,
      opinionId: opinionIds[reaction.targetIndex],
      kind: reaction.kind,
      reason: reaction.reason
    });
  }

  await client.mutation(api.analyses.requestAnalysis, {
    roomId: room.roomId,
    hostToken: room.hostToken
  });

  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    const latestAnalysis = await client.query(api.analyses.getLatestAnalysis, {
      roomId: room.roomId
    });

    if (latestAnalysis && latestAnalysis.status !== "pending") {
      const snapshot = await client.query(api.rooms.getAnalysisSnapshot, {
        roomId: room.roomId
      });

      return {
        room,
        snapshot,
        latestAnalysis
      };
    }

    await sleep(options.pollMs);
  }

  throw new Error(`Timed out waiting ${options.timeoutMs}ms for analysis to complete.`);
}

function buildSummary(run) {
  const analysis = run.latestAnalysis;
  const output = analysis.output ?? {};
  return {
    roomCode: run.room.code,
    status: analysis.status,
    totalResponsesSeeded: run.snapshot.opinions.length,
    reactionsSeeded: run.snapshot.opinions.reduce(
      (total, opinion) => total + opinion.yesCount + opinion.neutralCount + opinion.noCount,
      0
    ),
    spectrum: output.spectrum ?? null,
    camps: Array.isArray(output.camps)
      ? output.camps.map((camp) => ({
          label: camp.label,
          sentiment: camp.sentiment,
          supporter_count: camp.supporter_count
        }))
      : [],
    compromise: output.compromise?.summary ?? null,
    error: analysis.error ?? null
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { client } = await loadClient(options.envFile);
  const generated = generateCase(options);
  const run = await seedAndAnalyze(client, generated, options);

  const payload = {
    scenario: options.scenario,
    seed: options.seed,
    generated,
    run,
    summary: buildSummary(run)
  };

  if (options.output) {
    await fs.mkdir(path.dirname(options.output), { recursive: true });
    await fs.writeFile(options.output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
