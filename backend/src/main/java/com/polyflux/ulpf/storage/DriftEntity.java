package com.polyflux.ulpf.storage;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="ulpf_drift_reports")
public class DriftEntity {
 @Id public UUID id;
 @Column(name="source_key",nullable=false,length=512) public String sourceKey;
 @Column(nullable=false,columnDefinition="jsonb") @ColumnTransformer(write="?::jsonb") public String document;
 @Column(name="created_at",nullable=false) public Instant createdAt=Instant.now();
 protected DriftEntity(){}
 public DriftEntity(UUID id,String sourceKey,String document){this.id=id;this.sourceKey=sourceKey;this.document=document;}
}
