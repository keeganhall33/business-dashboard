export type RangeQuery = {
  preset?: string;
  start?: string;
  end?: string;
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function resolveRangeQuery(searchParams: PageProps["searchParams"]): Promise<RangeQuery> {
  const resolved = (await searchParams) ?? {};
  return {
    preset: typeof resolved.range === "string" ? resolved.range : undefined,
    start: typeof resolved.start === "string" ? resolved.start : undefined,
    end: typeof resolved.end === "string" ? resolved.end : undefined
  };
}
