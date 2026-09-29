package com.polyflux.ulpf.common;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class JsonSupport {
    private final ObjectMapper mapper;
    public JsonSupport(ObjectMapper mapper) { this.mapper = mapper; }
    public String write(Object value) {
        try { return mapper.writeValueAsString(value); }
        catch (Exception ex) { throw new IllegalStateException("Could not encode JSON document", ex); }
    }
    public Map<String, Object> readMap(String value) {
        try { return mapper.readValue(value, new TypeReference<>() {}); }
        catch (Exception ex) { throw new IllegalStateException("Could not decode stored JSON document", ex); }
    }
}
