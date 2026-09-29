package com.polyflux.ulpf.parser;

import java.util.LinkedHashMap;
import java.util.Map;

public class Parsed {
    public String parser = "generic-raw-parser", parserVersion = "1.0", format = "text", sourceKey = "unknown:text";
    public String deviceId, eventTime, vendor, product, sourceType, builtinMapping;
    public boolean timeInferred = true;
    public String selectionReason = "fallback";
    public final Map<String, String> fields = new LinkedHashMap<>();
    public final Map<String, int[]> spans = new LinkedHashMap<>();
}
