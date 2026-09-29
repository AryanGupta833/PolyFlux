package com.polyflux.ulpf.parser;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.polyflux.ulpf.schema.Ues.Raw;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.Month;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

@Component
public class LogParser {
    private static final Pattern KV = Pattern.compile("([A-Za-z0-9_.@-]+)=\\\"([^\\\"]*)\\\"|([A-Za-z0-9_.@-]+)=([^\\s,;]+)");
    private static final Pattern ASA = Pattern.compile("%ASA-(\\d)-(\\d{6}):\\s*(.*)$");
    private final ObjectMapper mapper; private final FormatDetector detector;
    public LogParser(ObjectMapper mapper, FormatDetector detector) { this.mapper=mapper; this.detector=detector; }

    public Parsed parse(Raw raw) {
        String text=raw.raw_text();String jsonLog=embeddedLog(text);if(jsonLog!=null)text=jsonLog;var candidates=detector.detect(text, raw.ingestion_context().containsKey("csv_header"));
        String format=candidates.getFirst().format(); Parsed p;
        if (text.contains("%ASA-")) p=parseAsa(text,raw);
        else if (text.contains("devname=") && text.contains("logid=")||text.contains("\"devname\"")&&text.contains("\"logid\"")) p=parseFortinet(text,raw);
        else if (format.equals("cef")) p=parseCef(text,raw);
        else if (format.equals("leef")) p=parseLeef(text,raw);
        else if (format.equals("json")) p=parseJson(text,raw);
        else if (format.equals("csv")) p=parseCsv(text,raw);
        else if (format.equals("kv") || format.equals("syslog") && kvRatio(text) >= .3) p=parseKv(text,raw);
        else if (format.equals("syslog")) p=parseSyslog(text,raw);
        else { p=new Parsed(); p.format="text"; p.eventTime=raw.received_at(); }
        p.selectionReason=p.parser+" selected; detected "+format+" ("+candidates.getFirst().reason()+")";
        return p;
    }

    private Parsed parseAsa(String t, Raw raw) {
        Parsed p=new Parsed(); p.parser="cisco-asa-parser"; p.format="syslog"; p.vendor="Cisco"; p.product="ASA"; p.sourceType="firewall"; p.builtinMapping="cisco-asa";
        Matcher head=Pattern.compile("^<\\d+>([A-Z][a-z]{2}) {1,2}(\\d{1,2}) (\\d\\d:\\d\\d:\\d\\d) (\\S+)").matcher(t);
        String host="ASA", date=raw.received_at();
        if(head.find()) { host=head.group(4); int month=Month.from(DateTimeFormatter.ofPattern("MMM",java.util.Locale.US).parse(head.group(1))).getValue(); int year=Instant.parse(raw.received_at()).atZone(ZoneOffset.UTC).getYear(); int nowMonth=Instant.parse(raw.received_at()).atZone(ZoneOffset.UTC).getMonthValue(); if(month>nowMonth+1) year--; try { date=LocalDateTime.of(year,month,Integer.parseInt(head.group(2)),Integer.parseInt(head.group(3).substring(0,2)),Integer.parseInt(head.group(3).substring(3,5)),Integer.parseInt(head.group(3).substring(6,8))).toInstant(ZoneOffset.UTC).toString();p.timeInferred=false; } catch(Exception ignored){} }
        p.deviceId=host; p.sourceKey="device:"+host; p.eventTime=date;
        Matcher m=ASA.matcher(t); if(!m.find())return p;
        put(p,"level",m.group(1),t); put(p,"msgid",m.group(2),t); put(p,"message",m.group(3),t);
        Matcher deny=Pattern.compile("^Deny (\\w+) src [^:]+:([\\d.:a-fA-F]+)/([0-9]+) dst [^:]+:([\\d.:a-fA-F]+)/([0-9]+)(?: by access-group \\\"([^\\\"]+)\\\")?").matcher(m.group(3));
        if(deny.find()){ put(p,"action","Deny",t); put(p,"protocol",deny.group(1),t); put(p,"src_ip",deny.group(2),t); put(p,"src_port",deny.group(3),t); put(p,"dst_ip",deny.group(4),t); put(p,"dst_port",deny.group(5),t); if(deny.group(6)!=null)put(p,"acl",deny.group(6),t); }
        Matcher built=Pattern.compile("^Built (inbound|outbound) (\\w+) connection .*? for \\S+:([\\d.]+)/([0-9]+) .*? to \\S+:([\\d.]+)/([0-9]+)").matcher(m.group(3));
        if(built.find()){put(p,"action","Built",t);put(p,"direction",built.group(1).toLowerCase(),t);put(p,"protocol",built.group(2),t);put(p,"src_ip",built.group(3),t);put(p,"src_port",built.group(4),t);put(p,"dst_ip",built.group(5),t);put(p,"dst_port",built.group(6),t);}
        Matcher auth=Pattern.compile("AAA user authentication (Rejected|Successful).*?user = (\\S+?)(?: :|$).*?(?:user IP = ([\\d.]+))?",Pattern.CASE_INSENSITIVE).matcher(m.group(3));
        if(auth.find()){put(p,"action",auth.group(1).equalsIgnoreCase("Rejected")?"auth-reject":"auth-success",t);put(p,"user",auth.group(2),t);if(auth.group(3)!=null)put(p,"src_ip",auth.group(3),t);}
        return p;
    }
    private Parsed parseFortinet(String t, Raw raw) {
        Parsed p=new Parsed(); p.parser="fortinet-parser";p.parserVersion="2.1";p.format="kv";p.vendor="Fortinet";p.product="FortiGate";p.sourceType="firewall";p.builtinMapping="fortinet-fgt";try{if(t.stripLeading().startsWith("{"))flatten(mapper.readTree(t),"",p,t);else parsePairs(t,p);}catch(Exception ignored){parsePairs(t,p);}
        String host=p.fields.getOrDefault("devname","fortigate");p.deviceId=host;p.sourceKey="device:"+host;
        try { p.eventTime=toInstant(p.fields.get("date")+"T"+p.fields.get("time"));p.timeInferred=false; }catch(Exception ignored){p.eventTime=raw.received_at();}
        return p;
    }
    private Parsed parseCef(String t, Raw raw) {
        Parsed p=new Parsed();p.parser="cef-parser";p.format="cef";p.vendor="";p.product="";p.sourceType="security";p.builtinMapping="cef-generic";
        int base=t.indexOf("CEF:");String[] h=t.substring(base).split("\\|",8);if(h.length<8)return p;
        p.vendor=h[1];p.product=h[2];String[] names={"cef_version","signature_id","name","severity"};for(int i=0;i<4;i++)put(p,names[i],h[i+3],t);
        parsePairs(h[7],p);String dev=p.fields.getOrDefault("dvchost",p.fields.getOrDefault("dvc",slug(p.vendor)+"-"+slug(p.product)));
        p.deviceId=dev;p.sourceKey="device:"+dev;String rt=p.fields.get("rt");if(rt!=null){try{p.eventTime=rt.matches("\\d{12,}")?Instant.ofEpochMilli(Long.parseLong(rt)).toString():Instant.parse(rt).toString();p.timeInferred=false;}catch(Exception ignored){}}
        if(p.eventTime==null)p.eventTime=raw.received_at();return p;
    }
    private Parsed parseLeef(String t, Raw raw) {
        Parsed p=new Parsed();p.parser="leef-parser";p.format="leef";p.sourceType="security";p.builtinMapping="leef-generic";String[] h=t.substring(t.indexOf("LEEF:")).split("\\|",6);if(h.length<6)return p;
        p.vendor=h[1];p.product=h[2];put(p,"leef_version",h[0],t);put(p,"event_id",h[4],t);parsePairs(h[5].replace('\t',' '),p);
        String dev=p.fields.getOrDefault("devName",slug(p.vendor)+"-"+slug(p.product));p.deviceId=dev;p.sourceKey="device:"+dev;p.eventTime=raw.received_at();return p;
    }
    private Parsed parseJson(String t, Raw raw) {
        Parsed p=new Parsed();p.parser="generic-json-parser";p.format="json";p.eventTime=raw.received_at();
        try {JsonNode root=mapper.readTree(t);flatten(root,"",p,t);String host=text(root,"host",text(root,"hostname",text(root,"device",text(root,"observer",""))));p.deviceId=host;p.sourceKey=host.isBlank()?"json:"+String.join(",",p.fields.keySet()).substring(0,Math.min(80,String.join(",",p.fields.keySet()).length())):"device:"+host;String eventTime=first(root,"@timestamp","timestamp","event_time","eventTime","datetime","date_time","time");if(eventTime==null&&root.hasNonNull("date")){String date=root.path("date").asText();String time=first(root,"time","eventTime");eventTime=time==null?date:date+"T"+time;}if(eventTime!=null)try{p.eventTime=toInstant(eventTime);p.timeInferred=false;}catch(Exception ignored){}}
        catch(Exception ex){throw new IllegalArgumentException("Unable to parse structured JSON event",ex);} return p;
    }
    private Parsed parseCsv(String t, Raw raw) {
        Parsed p=new Parsed();p.parser="generic-csv-parser";p.format="csv";p.eventTime=raw.received_at();
        Object h=raw.ingestion_context().get("csv_header");if(h instanceof List<?> headers){List<String> cols=splitCsv(t);for(int i=0;i<headers.size()&&i<cols.size();i++)put(p,String.valueOf(headers.get(i)),cols.get(i),t);}
        p.sourceKey="csv:"+String.join(",",((List<?>)raw.ingestion_context().getOrDefault("csv_header",List.of())).stream().map(String::valueOf).toList());return p;
    }
    private Parsed parseKv(String t, Raw raw) {
        Parsed p=new Parsed();p.parser="generic-kv-parser";p.format="kv";p.eventTime=raw.received_at();String work=t;int offset=0;String host="";
        Matcher sys=Pattern.compile("^<\\d+>(?:[A-Z][a-z]{2} {1,2}\\d{1,2} \\d\\d:\\d\\d:\\d\\d \\S+|1 \\S+ \\S+ \\S+ \\S+ \\S+ (?:-|\\[[^]]*\\])) ?").matcher(work);
        if(sys.find()){Matcher legacy=Pattern.compile("^<\\d+>([A-Z][a-z]{2}) {1,2}(\\d{1,2}) (\\d\\d:\\d\\d:\\d\\d) (\\S+)").matcher(work);if(legacy.find()){host=legacy.group(4);try{p.eventTime=rfc3164Time(legacy.group(1),legacy.group(2),legacy.group(3),raw.received_at());p.timeInferred=false;}catch(Exception ignored){}}else{Matcher rfc5424=Pattern.compile("^<\\d+>1 (\\S+) (\\S+)").matcher(work);if(rfc5424.find()){try{p.eventTime=Instant.parse(rfc5424.group(1)).toString();p.timeInferred=false;}catch(Exception ignored){}host=rfc5424.group(2);}}offset=sys.end();work=work.substring(offset);}
        Matcher ts=Pattern.compile("^(\\d{4}-\\d\\d-\\d\\d[ T]\\d\\d:\\d\\d:\\d\\d(?:\\.\\d+)?Z?)\\s+(\\S+)?\\s*").matcher(work);
        if(ts.find()){host=ts.group(2)==null?host:ts.group(2);try{p.eventTime=Instant.parse(ts.group(1).replace(" ","T").replaceAll("Z?$","Z")).toString();p.timeInferred=false;}catch(Exception ignored){}offset+=ts.end();work=work.substring(ts.end());}
        parsePairs(work,p);if(host.isBlank())host=p.fields.getOrDefault("devname","");if(!host.isBlank()){p.fields.putIfAbsent("_host",host);p.deviceId=host;p.sourceKey="device:"+host;}else p.sourceKey="kv:"+String.join(",",p.fields.keySet()).substring(0,Math.min(80,String.join(",",p.fields.keySet()).length()));return p;
    }
    private Parsed parseSyslog(String t, Raw raw) {
        Parsed p=new Parsed();p.parser="generic-syslog-parser";p.format="syslog";p.sourceType="network";p.builtinMapping="syslog-generic";p.eventTime=raw.received_at();Matcher m=Pattern.compile("^<(\\d+)>1 (\\S+) (\\S+) (\\S+) (\\S+) (\\S+) (?:-|\\[[^]]*\\]) ?(.*)$").matcher(t);
        if(m.find()){put(p,"pri",m.group(1),t);p.eventTime=m.group(2);p.deviceId=m.group(3);put(p,"host",m.group(3),t);put(p,"app",m.group(4),t);put(p,"message",m.group(7),t);p.timeInferred=false;}
        else {Matcher r=Pattern.compile("^<(\\d+)>([A-Z][a-z]{2}) {1,2}(\\d{1,2}) (\\d\\d:\\d\\d:\\d\\d) (\\S+) ?(.*)$").matcher(t);if(r.find()){put(p,"pri",r.group(1),t);p.deviceId=r.group(5);put(p,"host",r.group(5),t);put(p,"message",r.group(6),t);try{int month=Month.from(DateTimeFormatter.ofPattern("MMM",java.util.Locale.US).parse(r.group(2))).getValue();int year=Instant.parse(raw.received_at()).atZone(ZoneOffset.UTC).getYear();if(month>Instant.parse(raw.received_at()).atZone(ZoneOffset.UTC).getMonthValue()+1)year--;p.eventTime=LocalDateTime.of(year,month,Integer.parseInt(r.group(3)),Integer.parseInt(r.group(4).substring(0,2)),Integer.parseInt(r.group(4).substring(3,5)),Integer.parseInt(r.group(4).substring(6,8))).toInstant(ZoneOffset.UTC).toString();p.timeInferred=false;}catch(Exception ignored){}}}
        p.sourceKey="device:"+(p.deviceId==null?"syslog":p.deviceId);return p;
    }
    private void parsePairs(String text, Parsed p) { Matcher m=KV.matcher(text);while(m.find())put(p,m.group(1)!=null?m.group(1):m.group(3),m.group(2)!=null?m.group(2):m.group(4),text,m.start(m.group(1)!=null?2:4)); }
    private void flatten(JsonNode n,String prefix,Parsed p,String raw) {if(n.isObject()){n.fields().forEachRemaining(e->flatten(e.getValue(),prefix.isEmpty()?e.getKey():prefix+"."+e.getKey(),p,raw));}else{String v=n.isTextual()?n.asText():n.isContainerNode()?n.toString():n.asText();put(p,prefix,v,raw);}}
    private void put(Parsed p,String k,String v,String text){put(p,k,v,text,text.indexOf(v));}
    private void put(Parsed p,String k,String v,String text,int at){p.fields.put(k,v);if(at>=0)p.spans.put(k,new int[]{at,at+v.length()});}
    private static String text(JsonNode n,String key,String fallback){return n.path(key).isMissingNode()?fallback:n.path(key).asText(fallback);}
    private static String first(JsonNode n,String... keys){for(String key:keys)if(n.hasNonNull(key)&&n.path(key).isValueNode()){String value=n.path(key).asText();if(!value.isBlank())return value;}return null;}
    private String embeddedLog(String text){try{JsonNode root=mapper.readTree(text);if(root.isObject())for(String key:List.of("log","raw_log","raw_message","syslog")){JsonNode value=root.get(key);if(value!=null&&value.isTextual()&&(value.asText().contains("%ASA-")||value.asText().startsWith("CEF:")||value.asText().startsWith("LEEF:")||value.asText().matches("(?s)^<\\d+>.*")))return value.asText();}}catch(Exception ignored){}return null;}
    public static String toInstant(String value){String v=value.trim();if(v.matches("^\\d{13}$"))return Instant.ofEpochMilli(Long.parseLong(v)).toString();if(v.matches("^\\d{10}$"))return Instant.ofEpochSecond(Long.parseLong(v)).toString();try{return Instant.parse(v).toString();}catch(Exception ignored){}try{return OffsetDateTime.parse(v).toInstant().toString();}catch(Exception ignored){}try{return LocalDateTime.parse(v.replace(' ','T')).toInstant(ZoneOffset.UTC).toString();}catch(Exception ignored){}return LocalDate.parse(v).atStartOfDay().toInstant(ZoneOffset.UTC).toString();}
    private static String rfc3164Time(String monthName,String day,String clock,String received){int month=Month.from(DateTimeFormatter.ofPattern("MMM",java.util.Locale.US).parse(monthName)).getValue();Instant receivedAt=Instant.parse(received);int year=receivedAt.atZone(ZoneOffset.UTC).getYear();if(month>receivedAt.atZone(ZoneOffset.UTC).getMonthValue()+1)year--;return LocalDateTime.of(year,month,Integer.parseInt(day),Integer.parseInt(clock.substring(0,2)),Integer.parseInt(clock.substring(3,5)),Integer.parseInt(clock.substring(6,8))).toInstant(ZoneOffset.UTC).toString();}
    private static double kvRatio(String t){String[] x=t.trim().split("\\s+");if(t.isBlank())return 0;return (double)java.util.Arrays.stream(x).filter(a->a.matches("[A-Za-z0-9_.@-]+=.*")).count()/x.length;}
    private static String slug(String x){return x.toLowerCase().replaceAll("[^a-z0-9]+","-").replaceAll("^-|-$","");}
    private static List<String> splitCsv(String x){List<String> o=new ArrayList<>();StringBuilder b=new StringBuilder();boolean q=false;for(int i=0;i<x.length();i++){char c=x.charAt(i);if(c=='"'){if(q&&i+1<x.length()&&x.charAt(i+1)=='"'){b.append('"');i++;}else q=!q;}else if(c==','&&!q){o.add(b.toString().trim());b.setLength(0);}else b.append(c);}o.add(b.toString().trim());return o;}
}
