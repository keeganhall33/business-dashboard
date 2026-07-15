export function getDeploymentVersion() {
  return (
    process.env.NEXT_PUBLIC_APP_VERSION ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.COMMIT_SHA ??
    process.env.FLY_IMAGE_REF ??
    null
  );
}
