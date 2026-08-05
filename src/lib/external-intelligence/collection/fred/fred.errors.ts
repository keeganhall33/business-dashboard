export class FredCollectionError extends Error {
  name = "FredCollectionError";
}

export class FredCredentialMissingError extends FredCollectionError {
  name = "FredCredentialMissingError";
}

export class FredMalformedResponseError extends FredCollectionError {
  name = "FredMalformedResponseError";
}
