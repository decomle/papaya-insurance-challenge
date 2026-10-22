import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  Role,
  Precondition,
  PreconditionCheck,
  StateMachineConfig,
  StateName,
  Transition,
} from "../types/workflow";

const validRoles = new Set<Role>([
  "document_clerk",
  "team_lead",
  "assessor",
  "finance",
  "system",
]);
const validStates = new Set<StateName>([
  "SUBMITTED",
  "DOCUMENTS_VERIFIED",
  "UNDER_ASSESSMENT",
  "PENDING_INFO",
  "APPROVED",
  "REJECTED",
  "PAYMENT_INITIATED",
  "CLOSED",
]);
const validPreconditionChecks = new Set<PreconditionCheck>([
  "documents_present",
  "assessor_assigned",
  "assessment_report_complete",
  "approved_amount_within_policy_limit",
  "rejection_reason_provided",
  "missing_info_description_provided",
  "new_information_received",
  "payment_request_created",
  "payment_confirmed",
  "appeal_period_expired_or_acknowledged",
]);

/** Checks whether a value is a non-null, non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates and returns a non-empty string, reporting its config path on failure. */
function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid state machine config: ${path} must be a non-empty string`);
  }
  return value;
}

/** Validates and returns an array containing only non-empty strings. */
function requireStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(`Invalid state machine config: ${path} must be an array of non-empty strings`);
  }
  return value;
}

/** Parses and validates the precondition definitions for a transition. */
function parsePreconditions(value: unknown, path: string): Precondition[] {
  if (!Array.isArray(value)) throw new Error(`Invalid state machine config: ${path} must be an array`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Invalid state machine config: ${path}[${index}] must be an object`);
    const check = requireString(item.check, `${path}[${index}].check`);
    if (!validPreconditionChecks.has(check as PreconditionCheck)) {
      throw new Error(`Invalid state machine config: unknown precondition check "${check}"`);
    }
    return {
      check: check as PreconditionCheck,
      description: requireString(item.description, `${path}[${index}].description`),
    };
  });
}

/** Validates raw configuration data and converts it into the workflow config shape. */
function parseConfig(value: unknown): StateMachineConfig {
  if (!isRecord(value)) throw new Error("Invalid state machine config: root must be an object");
  const stateNames = new Set<string>();
  if (!Array.isArray(value.states) || value.states.length === 0) {
    throw new Error("Invalid state machine config: states must be a non-empty array");
  }

  const states = value.states.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Invalid state machine config: states[${index}] must be an object`);
    const name = requireString(item.name, `states[${index}].name`);
    const description = requireString(item.description, `states[${index}].description`);
    if (!validStates.has(name as StateName)) {
      throw new Error(`Invalid state machine config: state "${name}" is not supported by this application`);
    }
    if (stateNames.has(name)) throw new Error(`Invalid state machine config: duplicate state "${name}"`);
    stateNames.add(name);
    return { name: name as StateName, description };
  });

  const initialState = requireString(value.initialState, "initialState");
  if (!stateNames.has(initialState)) {
    throw new Error(`Invalid state machine config: initialState "${initialState}" is not declared`);
  }
  if (!Array.isArray(value.transitions)) {
    throw new Error("Invalid state machine config: transitions must be an array");
  }

  const transitionKeys = new Set<string>();
  const transitions: Transition[] = value.transitions.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Invalid state machine config: transitions[${index}] must be an object`);
    const from = requireString(item.from, `transitions[${index}].from`);
    const to = requireString(item.to, `transitions[${index}].to`);
    if (!stateNames.has(from)) throw new Error(`Invalid state machine config: transition source "${from}" is not declared`);
    if (!stateNames.has(to)) throw new Error(`Invalid state machine config: transition target "${to}" is not declared`);
    const key = `${from}->${to}`;
    if (transitionKeys.has(key)) throw new Error(`Invalid state machine config: duplicate transition "${key}"`);
    transitionKeys.add(key);

    const preconditions = parsePreconditions(item.preconditions, `transitions[${index}].preconditions`);
    const sideEffects = requireStringArray(item.sideEffects, `transitions[${index}].sideEffects`);
    if (!Array.isArray(item.authorizedRoles) || item.authorizedRoles.length === 0 ||
        item.authorizedRoles.some((role) => typeof role !== "string" || !validRoles.has(role as Role))) {
      throw new Error(`Invalid state machine config: transitions[${index}].authorizedRoles must contain known roles`);
    }
    return {
      from: from as StateName,
      to: to as StateName,
      preconditions,
      sideEffects,
      authorizedRoles: item.authorizedRoles as Role[],
    };
  });

  return { initialState: initialState as StateName, states, transitions };
}

/** Reads a JSON config file and validates states, transitions, descriptions, roles, and preconditions. */
export function loadStateMachineConfig(
  filePath = resolve(process.cwd(), "config/state-machine.json"),
): StateMachineConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to load state machine config at "${filePath}": ${detail}`);
  }
  return parseConfig(parsed);
}
