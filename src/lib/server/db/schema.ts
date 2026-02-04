import { pgTable, text, serial, integer, doublePrecision, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const cars = pgTable('cars', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    make: text('make'),
    model: text('model'),
    year: integer('year'),
    color: text('color').default('#ef4444'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const car_channel_mappings = pgTable('car_channel_mappings', {
    id: serial('id').primaryKey(),
    carId: integer('car_id').references(() => cars.id).notNull(),
    name: text('name').notNull(), // e.g. "Default VBOX", "Bosch Special"
    mapping: jsonb('mapping').notNull(), // Key-value mapping
    createdAt: timestamp('created_at').defaultNow(),
});

export const telemetry_view_presets = pgTable('telemetry_view_presets', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    carId: integer('car_id').references(() => cars.id), // null = global
    config: jsonb('config').notNull(), // LayoutConfig[]
    createdAt: timestamp('created_at').defaultNow(),
});

export const drivers = pgTable('drivers', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    color: text('color').default('#3b82f6'),
});

export const sessions = pgTable('sessions', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    track: text('track').notNull(),
    date: text('date').notNull(), // Keep as text (ISO string) for simplicity
    driverId: integer('driver_id').references(() => drivers.id),
    carId: integer('car_id').references(() => cars.id),

    airTemp: integer('air_temp'),
    trackTemp: integer('track_temp'),
    condition: text('condition'),

    tireCompound: text('tire_compound'),
    isNewSet: boolean('is_new_set'),
    tirePressureFL: doublePrecision('psi_start_fl'),
    tirePressureFR: doublePrecision('psi_start_fr'),
    tirePressureRL: doublePrecision('psi_start_rl'),
    tirePressureRR: doublePrecision('psi_start_rr'),

    notes: text('notes'),
    telemetryConfig: jsonb('telemetry_config'),
    trackConfig: jsonb('track_config').$type<{
        finishLine: { lat: number; lng: number; bearing: number } | null;
        sector1: { lat: number; lng: number; bearing: number } | null;
        sector2: { lat: number; lng: number; bearing: number } | null;
    }>(),
    status: text('status').default('confirmed'), // 'confirmed' | 'pending'

    // Video
    videoUrl: text('video_url'),
    originalVideoUrl: text('original_video_url'),
    bunnyVideoId: text('bunny_video_id'),
    optimizationStatus: text('optimization_status').default('none'),
    videoOffset: doublePrecision('video_offset').default(0),
    fastestLapVideoUrl: text('fastest_lap_video_url'),
    fastestLapVideoOffset: doublePrecision('fastest_lap_video_offset').default(0),

    // Multi-source linkage
    masterSourceId: integer('master_source_id'), // References telemetry_sources(id)
});

export const telemetry_sources = pgTable('telemetry_sources', {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id').references(() => sessions.id).notNull(),
    type: text('type').notNull(), // 'vbo', 'bosch', 'moetec', 'video_metadata'
    filename: text('filename').notNull(),
    timeOffset: doublePrecision('time_offset').default(0),
    importDate: timestamp('import_date').defaultNow(),

    // Metadata about the source itself (e.g. device serial, headers)
    metadata: jsonb('metadata'),
});

export const laps = pgTable('laps', {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id').references(() => sessions.id).notNull(),
    driverId: integer('driver_id').references(() => drivers.id),
    lapNumber: integer('lap_number').notNull(),
    timeSeconds: doublePrecision('time_seconds').notNull(),
    valid: boolean('valid').default(true),

    s1: doublePrecision('s1'),
    s2: doublePrecision('s2'),
    s3: doublePrecision('s3'),

    // Link to telemetry data availability
    hasTelemetry: boolean('has_telemetry').default(false),

    // Analysis results
    analysis: jsonb('analysis'), // CoachingTip[]
});

// Primary Telemetry Data (Columnar Arrays for high performance plotting)
// This replaces the old 'telemetry' and 'vbo_telemetry' tables for the MAIN viewer data.
export const lap_telemetry = pgTable('lap_telemetry', {
    id: serial('id').primaryKey(),
    sessionId: integer('session_id').references(() => sessions.id).notNull(),
    lapNumber: integer('lap_number').notNull(),

    // Core arrays (standardized)
    time: doublePrecision('time').array(),
    distance: doublePrecision('distance').array(),

    // GPS
    lat: doublePrecision('lat').array(),
    long: doublePrecision('long').array(),

    // Driver Inputs / Vehicle Dynamics
    speed: doublePrecision('speed').array(),
    rpm: doublePrecision('rpm').array(),
    throttle: doublePrecision('throttle').array(),
    brake: doublePrecision('brake').array(),
    gear: doublePrecision('gear').array(),
    steering: doublePrecision('steering').array(),

    // Optional standard channels
    glat: doublePrecision('glat').array(),
    glong: doublePrecision('glong').array(),
});

// Auxiliary Telemetry Channels (Vertical table for flexibility)
// Stores extra channels from Bosch or other sources that don't fit into the fixed columns
export const telemetry_channels = pgTable('telemetry_channels', {
    id: serial('id').primaryKey(),
    sourceId: integer('source_id').references(() => telemetry_sources.id).notNull(),
    lapId: integer('lap_id').references(() => laps.id), // Optional link to specific lap

    name: text('name').notNull(), // e.g. "Engine_Temp", "Susp_FL_Pos"
    unit: text('unit'),

    // Data array
    data: doublePrecision('data').array(),
});

export const tracks = pgTable('tracks', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    location: text('location'),

    pathData: jsonb('path_data').$type<{ lat: number[], long: number[] }>(),

    config: jsonb('config').$type<{
        finishLine: { lat: number; lng: number; bearing: number } | null;
        sector1: { lat: number; lng: number; bearing: number } | null;
        sector2: { lat: number; lng: number; bearing: number } | null;
    }>(),

    createdAt: timestamp('created_at').defaultNow(),
});

export const users = pgTable('users', {
    id: text('id').primaryKey(),
    username: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('driver'),
    driverId: integer('driver_id').references(() => drivers.id),
});

export const auth_sessions = pgTable('auth_sessions', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    expiresAt: integer('expires_at').notNull(), // Text or bigint for huge numbers? Integer in JS is safe up to 2^53.
});

export const share_links = pgTable('share_links', {
    id: text('id').primaryKey(),
    sessionId: integer('session_id').notNull().references(() => sessions.id),
    createdBy: text('created_by').references(() => users.id),
    config: jsonb('config').notNull().$type<{
        showTelemetry: boolean;
        showVideo: boolean;
        showAi: boolean;
    }>(),
    expiresAt: integer('expires_at'),
    createdAt: timestamp('created_at').defaultNow(),
});
