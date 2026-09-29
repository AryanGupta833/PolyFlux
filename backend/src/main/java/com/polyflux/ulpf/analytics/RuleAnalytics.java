package com.polyflux.ulpf.analytics;

import com.polyflux.ulpf.schema.Ues;
import com.polyflux.ulpf.storage.AlertEntity;
import com.polyflux.ulpf.storage.Alerts;
import com.polyflux.ulpf.storage.EventEntity;
import com.polyflux.ulpf.storage.Events;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class RuleAnalytics {
    private final Alerts alerts; private final Events events;
    public RuleAnalytics(Alerts alerts,Events events){this.alerts=alerts;this.events=events;}
    public void analyze(Map<String,Object> current){List<EventEntity> all=events.findAllByOrderByEventTimeDesc();List<Map<String,Object>> docs=new ArrayList<>();for(EventEntity e:all){try{docs.add(new com.fasterxml.jackson.databind.ObjectMapper().readValue(e.document,new com.fasterxml.jackson.core.type.TypeReference<>(){}));}catch(Exception ignored){}}
      String id=(String)current.get("event_id");docs.removeIf(e->id.equals(e.get("event_id")));docs.add(current);Map<String,Object> net=Ues.child(current,"network"),ev=Ues.child(current,"event"),identity=Ues.child(current,"identity");String src=(String)net.get("source_ip"),action=(String)ev.get("action"),user=(String)identity.get("username");Instant t;try{t=Instant.parse((String)Ues.child(current,"timestamps").get("event_time"));}catch(Exception ex){t=Instant.now();}Instant at=t;List<Map<String,Object>> recent=docs.stream().filter(x->{try{return Math.abs(Instant.parse((String)Ues.child(x,"timestamps").get("event_time")).toEpochMilli()-at.toEpochMilli())<=900000;}catch(Exception e){return false;}}).toList();
      if(src!=null&&"deny".equals(action)){List<Map<String,Object>> deny=recent.stream().filter(x->{Map<String,Object> n=Ues.child(x,"network"),e=Ues.child(x,"event");return src.equals(n.get("source_ip"))&&"deny".equals(e.get("action"));}).toList();Set<Object> ports=new HashSet<>();deny.forEach(x->{Object p=Ues.child(x,"network").get("destination_port");if(p!=null)ports.add(p);});if(ports.size()>=5)save("scan:"+src,"PORT_SCAN","Port scan from "+src,ports.size()+" distinct destination ports denied within 15 min",7,List.of("ip:"+src),deny);}
      String who=user==null?src:user;if(who!=null&&("login_failure".equals(action)||"login_success".equals(action))){List<Map<String,Object>> fails=new ArrayList<>();for(Map<String,Object> x:recent){Map<String,Object> event=Ues.child(x,"event"),network=Ues.child(x,"network"),actor=Ues.child(x,"identity");if("login_failure".equals(event.get("action"))&&(who.equals(actor.get("username"))||who.equals(network.get("source_ip"))))fails.add(x);}if(fails.size()>=3){Set<String> entitySet=new java.util.LinkedHashSet<>();for(Map<String,Object> x:fails){Map<String,Object> actor=Ues.child(x,"identity"),network=Ues.child(x,"network");if(actor.get("username")!=null)entitySet.add("user:"+actor.get("username"));if(network.get("source_ip")!=null)entitySet.add("ip:"+network.get("source_ip"));}List<String> entities=new ArrayList<>(entitySet);save("brute:"+who,"BRUTE_FORCE","Brute force against "+who,fails.size()+" authentication failures within 15 min",8,entities,fails);if("login_success".equals(action)){List<Map<String,Object>> chain=new ArrayList<>(fails);chain.add(current);save("compromise:"+who,"LOGIN_AFTER_BRUTE_FORCE","Successful login after brute force: "+who,"Authentication succeeded after repeated failures — possible compromise",9,entities,chain);}}}
    }
    private void save(String key,String rule,String title,String description,int severity,List<String> entities,List<Map<String,Object>> evidence){List<String> ids=evidence.stream().map(e->(String)e.get("event_id")).distinct().toList();Map<String,Object> doc=Ues.map("id",UUID.randomUUID().toString(),"key",key,"rule",rule,"severity",severity,"title",title,"description",description,"entities",entities,"evidence",ids,"created_at",Ues.now());AlertEntity existing=alerts.findAllByOrderByCreatedAtDesc().stream().filter(a->a.alertKey.equals(key)).findFirst().orElse(null);try{com.fasterxml.jackson.databind.ObjectMapper mapper=new com.fasterxml.jackson.databind.ObjectMapper();if(existing!=null){Map<String,Object> old=mapper.readValue(existing.document,new com.fasterxml.jackson.core.type.TypeReference<>(){});Set<String> merged=new java.util.LinkedHashSet<>((List<String>)old.get("evidence"));merged.addAll(ids);old.put("evidence",new ArrayList<>(merged));existing.document=mapper.writeValueAsString(old);alerts.save(existing);}else alerts.save(new AlertEntity(UUID.fromString((String)doc.get("id")),key,mapper.writeValueAsString(doc)));}catch(Exception ignored){}}
}
