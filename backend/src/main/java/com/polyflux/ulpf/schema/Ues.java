package com.polyflux.ulpf.schema;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.polyflux.ulpf.parser.Parsed;

public final class Ues {
    private Ues() { }
    public record MappingEntry(String source_field, String target, String type, Map<String, String> enum_map,
                               Boolean required, double confidence, List<String> transforms) { }
    public record Mapping(String mapping_id, String version, String parser, String source_key,
                          List<MappingEntry> entries, String created_at, String approved_by, Boolean builtin) { }
    public record FieldSuggestion(String source_field, String sample, String target, double confidence, String reason) { }
    public record Raw(String raw_event_id, String ingestion_id, String raw_text, String raw_sha256,
                      int byte_length, String received_at, String transport, Map<String, Object> ingestion_context) { }
    public static Map<String, Object> event(UUID id, Raw raw, Parsed parsed) {
        Map<String, Object> ev = new LinkedHashMap<>();
        ev.put("event_id", id.toString()); ev.put("schema", Map.of("name", "ULPF", "version", "1.0"));
        ev.put("timestamps", map("event_time", parsed.eventTime == null ? raw.received_at() : parsed.eventTime,
                "ingest_time", raw.received_at(), "event_time_inferred", parsed.timeInferred));
        ev.put("source", map("vendor", parsed.vendor, "product", parsed.product, "device_id", parsed.deviceId, "device_ip", null, "source_type", parsed.sourceType));
        ev.put("event", map("category", null, "type", null, "action", null, "outcome", null, "severity", null, "original_severity", null));
        ev.put("network", map("source_ip", null, "destination_ip", null, "source_port", null, "destination_port", null, "protocol", null, "direction", null));
        ev.put("identity", map("user_id", null, "username", null)); ev.put("rule", map("id", null, "name", null));
        ev.put("normalization", map("status", "RAW_ONLY", "mapping_id", null, "mapping_version", null, "quality", 0, "uncertain_fields", new ArrayList<>()));
        ev.put("parser", map("name", parsed.parser, "version", parsed.parserVersion, "format", parsed.format, "selection_reason", parsed.selectionReason));
        ev.put("trace", map("raw_event_id", raw.raw_event_id(), "ingestion_id", raw.ingestion_id(), "raw_sha256", raw.raw_sha256(), "source_key", parsed.sourceKey));
        ev.put("lineage", new LinkedHashMap<>()); ev.put("enrichment", new LinkedHashMap<>());
        ev.put("extensions", map("vendor_specific", new LinkedHashMap<>(parsed.fields)));
        return ev;
    }
    @SuppressWarnings("unchecked") public static Map<String, Object> child(Map<String, Object> parent, String key) {
        return (Map<String, Object>) parent.get(key);
    }
    public static Map<String, Object> map(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i=0; i<pairs.length; i+=2) out.put((String)pairs[i], pairs[i+1]);
        return out;
    }
    public static UUID eventId(String rawEventId) { return UUID.nameUUIDFromBytes(("ulpf:event:" + rawEventId).getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
    public static String now() { return Instant.now().toString(); }
}
