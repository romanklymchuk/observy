const STATES = Object.freeze({
  BOOT: "BOOT",
  INITIALIZING: "INITIALIZING",
  READY: "READY",
  WAITING_TRIGGER: "WAITING_TRIGGER",
  TRIGGERED: "TRIGGERED",
  CAPTURING: "CAPTURING",
  PROCESSING: "PROCESSING",
  UPLOADING: "UPLOADING",
  COMPLETED: "COMPLETED",
  QUEUED: "QUEUED",
  ERROR: "ERROR",
  RECOVERING: "RECOVERING",
  STOPPED: "STOPPED",
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [STATES.BOOT]: [
    STATES.INITIALIZING,
    STATES.ERROR,
  ],

  [STATES.INITIALIZING]: [
    STATES.READY,
    STATES.ERROR,
  ],

  [STATES.READY]: [
    STATES.WAITING_TRIGGER,
    STATES.ERROR,
    STATES.STOPPED,
  ],

  [STATES.WAITING_TRIGGER]: [
    STATES.TRIGGERED,
    STATES.ERROR,
    STATES.STOPPED,
  ],

  [STATES.TRIGGERED]: [
    STATES.CAPTURING,
    STATES.ERROR,
  ],

  [STATES.CAPTURING]: [
    STATES.PROCESSING,
    STATES.ERROR,
  ],

  [STATES.PROCESSING]: [
    STATES.UPLOADING,
    STATES.ERROR,
  ],

  [STATES.UPLOADING]: [
    STATES.COMPLETED,
    STATES.QUEUED,
    STATES.ERROR,
  ],

  [STATES.COMPLETED]: [
    STATES.WAITING_TRIGGER,
    STATES.STOPPED,
  ],

  [STATES.QUEUED]: [
    STATES.WAITING_TRIGGER,
    STATES.STOPPED,
    STATES.ERROR,
  ],

  [STATES.ERROR]: [
    STATES.RECOVERING,
    STATES.STOPPED,
  ],

  [STATES.RECOVERING]: [
    STATES.READY,
    STATES.WAITING_TRIGGER,
    STATES.ERROR,
    STATES.STOPPED,
  ],

  [STATES.STOPPED]: [],
});

function assertKnownState(state) {
  if (!Object.values(STATES).includes(state)) {
    throw new Error(
      `Unknown runtime state: ${state}`
    );
  }
}

function createStateMachine({
  initialState = STATES.BOOT,
  logger = null,
} = {}) {
  assertKnownState(initialState);

  let currentState = initialState;
  let previousState = null;
  let changedAt = new Date().toISOString();

  function canTransition(nextState) {
    assertKnownState(nextState);

    return ALLOWED_TRANSITIONS[
      currentState
    ].includes(nextState);
  }

  function transition(
    nextState,
    metadata = {}
  ) {
    assertKnownState(nextState);

    if (nextState === currentState) {
      return getSnapshot();
    }

    if (!canTransition(nextState)) {
      throw new Error(
        `Invalid state transition: ${currentState} -> ${nextState}`
      );
    }

    const fromState = currentState;

    previousState = fromState;
    currentState = nextState;
    changedAt = new Date().toISOString();

    logger?.info(
      "runtime.state.changed",
      {
        fromState,
        toState: nextState,
        changedAt,
        metadata,
      }
    );

    return getSnapshot();
  }

  function getState() {
    return currentState;
  }

  function getSnapshot() {
    return {
      state: currentState,
      previousState,
      changedAt,
    };
  }

  return {
    transition,
    canTransition,
    getState,
    getSnapshot,
  };
}

module.exports = {
  STATES,
  ALLOWED_TRANSITIONS,
  createStateMachine,
};
