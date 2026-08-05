export class SourceGovernanceError extends Error {
  name = "SourceGovernanceError";
}

export class SourceGovernanceConfigNotFoundError extends SourceGovernanceError {
  name = "SourceGovernanceConfigNotFoundError";
}

export class SourceGovernanceConfigInvalidError extends SourceGovernanceError {
  name = "SourceGovernanceConfigInvalidError";
}

export class SourceGovernanceEligibilityBlockedError extends SourceGovernanceError {
  name = "SourceGovernanceEligibilityBlockedError";
}
