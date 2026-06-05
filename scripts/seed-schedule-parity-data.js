const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SEED_TAG = "[Schedule seed]";
const PROGRAMS = [
  ["Strength", "#f5c542", "Barbell strength and progressive overload tracks."],
  ["Conditioning", "#38bdf8", "High-output conditioning, circuits, and engine work."],
  ["Youth Performance", "#a78bfa", "Age-aware athletic development sessions."],
  ["Private Training", "#fb7185", "Bookable coaching blocks for one-on-one work."],
  ["Open Gym", "#34d399", "Member access blocks for independent training."]
];

const SESSION_TEMPLATES = [
  { title: "6 AM Strength", hour: 6, durationMinutes: 60, program: "Strength", capacity: 24 },
  { title: "9 AM Open Gym", hour: 9, durationMinutes: 120, program: "Open Gym", capacity: 42 },
  { title: "Noon Conditioning", hour: 12, durationMinutes: 45, program: "Conditioning", capacity: 28 },
  { title: "5 PM Strength", hour: 17, durationMinutes: 60, program: "Strength", capacity: 32 },
  { title: "7 PM Private Training", hour: 19, durationMinutes: 60, program: "Private Training", capacity: 6 }
];

function readEnvFile(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce((acc, line) => {
      const separator = line.indexOf("=");
      if (separator > 0) {
        acc[line.slice(0, separator)] = line.slice(separator + 1);
      }
      return acc;
    }, {});
}

function makeSupabaseClient() {
  const env = readEnvFile(path.join(process.cwd(), ".env.local"));
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function sessionDate(dayOffset, hour) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + dayOffset);
  date.setUTCHours(hour, (dayOffset * 7) % 30, 0, 0);
  return date;
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function getTargetGym(supabase) {
  const requestedSlug = process.argv[2] ?? process.env.SCHEDULE_SEED_GYM_SLUG;

  if (requestedSlug) {
    const { data, error } = await supabase
      .from("gyms")
      .select("id, name, slug, timezone")
      .eq("slug", requestedSlug)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }
  }

  const { data, error } = await supabase
    .from("gyms")
    .select("id, name, slug, timezone")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("No gyms found to seed.");
  }

  return data;
}

async function ensurePrograms(supabase, gymId) {
  const names = PROGRAMS.map(([name]) => name);
  const { data: existing, error } = await supabase
    .from("schedule_programs")
    .select("*")
    .eq("gym_id", gymId)
    .in("name", names);

  if (error) {
    throw error;
  }

  const existingByName = new Map((existing ?? []).map((program) => [program.name, program]));
  const missing = PROGRAMS.filter(([name]) => !existingByName.has(name)).map(
    ([name, color, description], index) => ({
      gym_id: gymId,
      name,
      color,
      description,
      sort_order: index
    })
  );

  if (missing.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("schedule_programs")
      .insert(missing)
      .select("*");

    if (insertError) {
      throw insertError;
    }

    for (const program of inserted ?? []) {
      existingByName.set(program.name, program);
    }
  }

  return existingByName;
}

async function clearPriorSeedSessions(supabase, gymId) {
  const { data: sessions, error } = await supabase
    .from("schedule_sessions")
    .select("id")
    .eq("gym_id", gymId)
    .ilike("description", `%${SEED_TAG}%`);

  if (error) {
    throw error;
  }

  const sessionIds = (sessions ?? []).map((session) => session.id);

  if (sessionIds.length === 0) {
    return;
  }

  const { error: bookingDeleteError } = await supabase
    .from("schedule_bookings")
    .delete()
    .in("session_id", sessionIds);

  if (bookingDeleteError) {
    throw bookingDeleteError;
  }

  const { error: sessionDeleteError } = await supabase
    .from("schedule_sessions")
    .delete()
    .in("id", sessionIds);

  if (sessionDeleteError) {
    throw sessionDeleteError;
  }
}

async function seedSessions(supabase, gym, programsByName) {
  const sessions = [];

  for (let day = 0; day < 14; day += 1) {
    for (const template of SESSION_TEMPLATES) {
      const startsAt = sessionDate(day, template.hour);
      const endsAt = addMinutes(startsAt, template.durationMinutes);
      const program = programsByName.get(template.program);

      sessions.push({
        gym_id: gym.id,
        program_id: program?.id ?? null,
        title: `${template.title}`,
        description: `${SEED_TAG} Realistic capacity and booking data for parity testing.`,
        instructor_name:
          template.program === "Private Training" ? "Coach Riley" : "Coach Morgan",
        location:
          template.program === "Open Gym"
            ? "Main floor"
            : template.program === "Private Training"
              ? "Coaching bay"
              : "Performance floor",
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        timezone: gym.timezone,
        capacity: template.capacity,
        booking_enabled: true,
        waitlist_enabled: true,
        visibility: "member_portal",
        cost_cents: template.program === "Private Training" ? 4500 : 0
      });
    }
  }

  const { data, error } = await supabase
    .from("schedule_sessions")
    .insert(sessions)
    .select("*");

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function seedBookings(supabase, gymId, sessions) {
  const { data: members, error } = await supabase
    .from("members")
    .select("id")
    .eq("gym_id", gymId)
    .in("status", ["active", "lead"])
    .order("created_at", { ascending: true })
    .limit(650);

  if (error) {
    throw error;
  }

  const memberIds = (members ?? []).map((member) => member.id);

  if (memberIds.length === 0) {
    return 0;
  }

  const bookings = [];

  sessions.forEach((session, sessionIndex) => {
    const capacity = session.capacity ?? 20;
    const desiredCount =
      sessionIndex % 5 === 0
        ? capacity + 4
        : sessionIndex % 4 === 0
          ? capacity
          : Math.max(4, capacity - 6);

    for (let index = 0; index < desiredCount; index += 1) {
      const memberId = memberIds[(sessionIndex * 37 + index) % memberIds.length];
      const status = index < capacity ? "booked" : "waitlisted";

      bookings.push({
        gym_id: gymId,
        session_id: session.id,
        member_id: memberId,
        status,
        source: index % 3 === 0 ? "member_app" : "dashboard"
      });
    }
  });

  let inserted = 0;

  for (const bookingChunk of chunk(bookings, 500)) {
    const { data, error: insertError } = await supabase
      .from("schedule_bookings")
      .insert(bookingChunk)
      .select("id");

    if (insertError) {
      throw insertError;
    }

    inserted += data?.length ?? 0;
  }

  return inserted;
}

async function main() {
  const supabase = makeSupabaseClient();
  const gym = await getTargetGym(supabase);
  console.log(`Seeding schedule for ${gym.name} (${gym.slug})...`);

  const programsByName = await ensurePrograms(supabase, gym.id);
  await clearPriorSeedSessions(supabase, gym.id);
  const sessions = await seedSessions(supabase, gym, programsByName);
  const bookingCount = await seedBookings(supabase, gym.id, sessions);

  console.log(
    JSON.stringify(
      {
        gym: gym.slug,
        programs: programsByName.size,
        sessions: sessions.length,
        bookings: bookingCount
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
