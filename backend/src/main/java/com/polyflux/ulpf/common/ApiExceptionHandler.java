package com.polyflux.ulpf.common;

import java.time.Instant;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, Object>> status(ResponseStatusException ex) {
        var status = HttpStatus.valueOf(ex.getStatusCode().value());
        return ResponseEntity.status(status).body(Map.of("code", status.name(), "message", ex.getReason() == null ? status.getReasonPhrase() : ex.getReason(), "trace_id", Instant.now().toString()));
    }
    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<Map<String, Object>> invalid(MethodArgumentNotValidException ex) {
        return ResponseEntity.badRequest().body(Map.of("code", "VALIDATION_ERROR", "message", "Request validation failed", "details", ex.getBindingResult().getFieldErrors().stream().map(e -> e.getField() + ": " + e.getDefaultMessage()).toList(), "trace_id", Instant.now().toString()));
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, Object>> unknown(Exception ex) {
        return ResponseEntity.internalServerError().body(Map.of("code", "INTERNAL_ERROR", "message", "The request could not be processed", "trace_id", Instant.now().toString()));
    }
}
