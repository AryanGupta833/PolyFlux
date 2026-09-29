package com.polyflux.ulpf.api;

import com.polyflux.ulpf.ingestion.PipelineService;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController @RequestMapping("/api/public/v1")
public class PublicIngestController {
    private final PipelineService pipeline;
    public PublicIngestController(PipelineService pipeline){this.pipeline=pipeline;}
    @PostMapping("/events") public Map<String,Object> ingest(@RequestBody String body){return pipeline.ingest(body,"http",null);}
    @GetMapping("/health") public Map<String,Object> health(){return Map.of("status","ok","service","ulpf","schema","UES 1.0","backend","spring-boot");}
}
