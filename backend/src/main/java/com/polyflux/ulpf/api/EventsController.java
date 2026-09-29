package com.polyflux.ulpf.api;

import com.polyflux.ulpf.ingestion.PipelineService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController @RequestMapping("/api/v1")
public class EventsController {
    public record IngestRequest(@NotBlank String text,String transport,String file) { }
    public record ApproveRequest(List<com.polyflux.ulpf.schema.Ues.FieldSuggestion> suggestions) { }
    private final PipelineService pipeline;
    public EventsController(PipelineService pipeline){this.pipeline=pipeline;}
    @GetMapping("/state") public Map<String,Object> state(){return pipeline.state();}
    @PostMapping(value="/events",consumes={MediaType.APPLICATION_JSON_VALUE,MediaType.TEXT_PLAIN_VALUE,MediaType.APPLICATION_NDJSON_VALUE})
    public Map<String,Object> ingest(@RequestBody String body){return pipeline.ingest(body,"http",null);}
    @PostMapping(value="/ingest/file",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String,Object> file(@org.springframework.web.bind.annotation.RequestPart("file") org.springframework.web.multipart.MultipartFile file)throws java.io.IOException{return pipeline.ingest(new String(file.getBytes(),java.nio.charset.StandardCharsets.UTF_8),"file",file.getOriginalFilename());}
    @PostMapping("/proposals/{id}/approve") public Map<String,Object> approve(@PathVariable String id,@RequestBody(required=false) ApproveRequest request){return pipeline.approve(id,request==null?null:request.suggestions());}
    @PostMapping("/proposals/{id}/reject") public Map<String,Object> reject(@PathVariable String id){pipeline.reject(id);return Map.of("ok",true);}
    @PostMapping("/reprocess") public Map<String,Object> reprocess(){return Map.of("count",pipeline.reprocess());}
    @PostMapping("/dlq/retry") public Map<String,Object> retry(){pipeline.retryDlq();return Map.of("ok",true);}
    @PostMapping("/reset") public Map<String,Object> reset(){pipeline.reset();return Map.of("ok",true);}
}
