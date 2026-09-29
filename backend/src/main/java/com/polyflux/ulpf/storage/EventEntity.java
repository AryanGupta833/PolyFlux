package com.polyflux.ulpf.storage;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="ulpf_events")
public class EventEntity {
    @Id @Column(name="event_id") public UUID id;
    @Column(name="raw_event_id",nullable=false,unique=true) public UUID rawEventId;
    @Column(name="source_key",nullable=false,length=512) public String sourceKey;
    @Column(nullable=false,length=32) public String status;
    @Column(name="event_time",nullable=false) public Instant eventTime;
    @Column(nullable=false,columnDefinition="jsonb") @ColumnTransformer(write="?::jsonb") public String document;
    @Column(nullable=false,columnDefinition="jsonb") @ColumnTransformer(write="?::jsonb") public String parsed;
    @Column(name="created_at",nullable=false) public Instant createdAt=Instant.now();
    protected EventEntity() { }
    public EventEntity(UUID id,UUID rawEventId,String sourceKey,String status,Instant eventTime,String document,String parsed){this.id=id;this.rawEventId=rawEventId;this.sourceKey=sourceKey;this.status=status;this.eventTime=eventTime;this.document=document;this.parsed=parsed;}
}
