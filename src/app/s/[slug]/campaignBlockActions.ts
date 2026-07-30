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
