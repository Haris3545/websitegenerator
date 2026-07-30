"use server";

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { BoardItem } from "@/lib/database.types";
import type { TacticPillar } from "@/lib/tacticFields";

/** Backs the Calendar tab's Tease/Release/Sustain Gantt (CampaignGanttBoard)
 * — deliberately just another way to create a `board_items` row with
 * board_key "tactics" rather than a new table, since campaign_start_date/
 * campaign_end_date/pillar already exist there for exactly this (see
 * migrations 035/036 for the Tactics tab's own rich form). A block created
 * here shows up as a tactic card on the Tactics tab too, and vice versa —
 * one underlying list of dated campaign activity, two views of it. */
export async function addCampaignBlock(
  artistId: string,
  pillar: TacticPillar,
  name: string,
  startDate: string,
  endDate: string
): Promise<{ ok: true; item: BoardItem } | { ok: false; error: string }> {
  if (!name.trim()) return { ok: false, error: "Name can't be empty." };
  if (!startDate || !endDate) return { ok: false, error: "Start and end dates are required." };

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("board_items")
    .insert({
      artist_id: artistId,
      board_key: "tactics",
      title: name.trim(),
      body: "",
      pillar,
      campaign_start_date: startDate,
      campaign_end_date: endDate,
    })
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/s/[slug]`, "layout");
  return { ok: true, item: data };
}

export async function deleteCampaignBlock(id: string) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("board_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/s/[slug]`, "layout");
}

/** Used for every kind of change to an existing block: the Edit modal
 * (name + dates), dragging an edge to resize (dates only), and dragging
 * the block itself to a new pillar and/or time slot (pillar + dates) — all
 * funnel through here rather than three separate actions, since they're
 * all just "update this row's campaign fields." `name` left undefined
 * means "don't touch the title" (the two drag interactions never change
 * it). */
export async function updateCampaignBlock(
  id: string,
  name: string | undefined,
  pillar: TacticPillar,
  startDate: string,
  endDate: string
): Promise<{ ok: true; item: BoardItem } | { ok: false; error: string }> {
  if (!startDate || !endDate) return { ok: false, error: "Start and end dates are required." };
  if (name !== undefined && !name.trim()) return { ok: false, error: "Name can't be empty." };

  const supabase = createServiceRoleClient();
  const patch: { title?: string; pillar: TacticPillar; campaign_start_date: string; campaign_end_date: string } = {
    pillar,
    campaign_start_date: startDate,
    campaign_end_date: endDate,
  };
  if (name !== undefined) patch.title = name.trim();

  const { data, error } = await supabase.from("board_items").update(patch).eq("id", id).select().single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/s/[slug]`, "layout");
  return { ok: true, item: data };
}
