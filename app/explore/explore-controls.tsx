"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { LICENSE_IDS, LICENSES } from "@/config/licenses";
import { CATEGORIES, STYLES, TOOLS } from "@/config/taxonomy";
import { Input } from "@/components/ui/field";
import { Chip, Select } from "@/components/ui/select";
import type { ExploreFilters } from "@/lib/projects/queries";

/**
 * Filters are a plain GET form, so they work before JavaScript loads; with JS, changes apply
 * immediately.
 */
export function ExploreControls({ filters }: { filters: ExploreFilters }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);

  function apply(overrides: Record<string, string | undefined> = {}) {
    if (!form.current) return;
    const data = new FormData(form.current);
    const params = new URLSearchParams();
    for (const [k, v] of data.entries()) if (typeof v === "string" && v) params.set(k, v);
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `/explore?${qs}` : "/explore", { scroll: false });
  }

  return (
    <form
      ref={form}
      action="/explore"
      method="get"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-3 md:flex-row">
        <label htmlFor="q" className="sr-only">
          Search templates
        </label>
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={filters.q}
          placeholder="Search titles and tags"
          className="h-12 md:flex-1"
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:flex">
          <FilterSelect
            name="category"
            label="Category"
            value={filters.category}
            options={CATEGORIES}
            onChange={() => apply()}
          />
          <FilterSelect
            name="tool"
            label="Made with"
            value={filters.tool}
            options={TOOLS}
            onChange={() => apply()}
          />
          <FilterSelect
            name="license"
            label="License"
            value={filters.license}
            options={LICENSE_IDS.map((id) => ({ id, label: LICENSES[id].shortName }))}
            onChange={() => apply()}
          />
          <div className="md:w-36">
            <label htmlFor="sort" className="sr-only">
              Sort
            </label>
            <Select
              id="sort"
              name="sort"
              defaultValue={filters.sort ?? "new"}
              onChange={() => apply()}
              className="h-12"
            >
              <option value="new">Newest</option>
              <option value="popular">Most liked</option>
            </Select>
          </div>
        </div>
      </div>
      <input type="hidden" name="style" value={filters.style ?? ""} />
      <div
        className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        aria-label="Style"
      >
        {STYLES.map((s) => {
          const on = filters.style === s.id;
          return (
            <Chip
              key={s.id}
              selected={on}
              className="shrink-0"
              onClick={() => apply({ style: on ? undefined : s.id })}
            >
              {s.label}
            </Chip>
          );
        })}
      </div>
      <noscript>
        <button type="submit" className="w-fit underline">
          Apply filters
        </button>
      </noscript>
    </form>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value?: string;
  options: readonly { id: string; label: string }[];
  onChange: () => void;
}) {
  return (
    <div className="md:w-40">
      <label htmlFor={`f-${name}`} className="sr-only">
        {label}
      </label>
      <Select
        id={`f-${name}`}
        name={name}
        defaultValue={value ?? ""}
        onChange={onChange}
        className="h-12"
      >
        <option value="">{label}: any</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
