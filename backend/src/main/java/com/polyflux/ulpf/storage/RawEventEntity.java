package com.polyflux.ulpf.storage;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="ulpf_raw_events")
public class RawEventEntity {
    @Id @Column(name="raw_event_id") public UUID id;
    @Column(name="ingestion_id",nullable=false) public UUID ingestionId;
    @Column(name="raw_text",nullable=false,columnDefinition="text") public String rawText;
    @Column(name="raw_sha256",nullable=false,length=64) public String sha256;
    @Column(name="byte_length",nullable=false) public int byteLength;
    @Column(name="received_at",nullable=false) public Instant receivedAt;
    @Column(nullable=false,length=32) public String transport;
    @Column(name="ingestion_context",nullable=false,columnDefinition="jsonb") @ColumnTransformer(write="?::jsonb") public String contextJson="{}";
    protected RawEventEntity() { }
    public RawEventEntity(UUID id,UUID ingestionId,String rawText,String sha256,int byteLength,Instant receivedAt,String transport,String contextJson){this.id=id;this.ingestionId=ingestionId;this.rawText=rawText;this.sha256=sha256;this.byteLength=byteLength;this.receivedAt=receivedAt;this.transport=transport;this.contextJson=contextJson;}
}
