package com.polyflux.ulpf.parser;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class FormatDetector {
    public record Candidate(String format, double confidence, String reason) { }
    private final ObjectMapper mapper;
    public FormatDetector(ObjectMapper mapper) { this.mapper = mapper; }
    public List<Candidate> detect(String text, boolean csv) {
        var out = new ArrayList<Candidate>(); var t=text.trim();
        if (csv) out.add(new Candidate("csv", .95, "row of CSV ingestion with header"));
        if (t.startsWith("{") && t.endsWith("}")) {
            try { mapper.readTree(t); out.add(new Candidate("json", .99, "balanced object parse succeeded")); }
            catch (Exception ignored) { out.add(new Candidate("json", .2, "looks like JSON but parse failed")); }
        }
        if (t.matches("(?s).*(^|\\s)CEF:\\d\\|.*") && t.substring(t.indexOf("CEF:")).split("\\|", -1).length >= 8) out.add(new Candidate("cef", .98, "CEF header detected"));
        if (t.matches("(?s).*(^|\\s)LEEF:(1\\.0|2\\.0)\\|.*")) out.add(new Candidate("leef", .97, "LEEF prefix detected"));
        if (t.matches("^<\\d{1,3}>.*")) out.add(new Candidate("syslog", .9, "leading PRI header"));
        String[] tokens=t.split("\\s+"); long kv=java.util.Arrays.stream(tokens).filter(x -> x.matches("[A-Za-z0-9_.@-]+=.*")).count();
        double ratio=tokens.length==0?0:(double)kv/tokens.length;
        if (ratio>=.3) out.add(new Candidate("kv", Math.min(.95,.4+ratio*.6), Math.round(ratio*100)+"% key=value tokens"));
        out.add(new Candidate("text",.05,"fallback")); out.sort((a,b)->Double.compare(b.confidence(),a.confidence())); return out;
    }
}
