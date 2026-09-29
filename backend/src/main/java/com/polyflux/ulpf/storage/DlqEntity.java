package com.polyflux.ulpf.storage;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="ulpf_dlq")
public class DlqEntity {
    @Id @Column(name="raw_event_id") public UUID rawEventId;
    @Column(nullable=false,columnDefinition="jsonb") @ColumnTransformer(write="?::jsonb") public String document;
    @Column(nullable=false) public int attempts=1;
    @Column(name="created_at",nullable=false) public Instant createdAt=Instant.now();
    protected DlqEntity(){}
    public DlqEntity(UUID rawEventId,String document){this.rawEventId=rawEventId;this.document=document;}
}
