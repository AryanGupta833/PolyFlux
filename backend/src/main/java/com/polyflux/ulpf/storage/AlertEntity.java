package com.polyflux.ulpf.storage;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="ulpf_alerts")
public class AlertEntity {
    @Id public UUID id;
    @Column(name="alert_key",nullable=false,unique=true,length=512) public String alertKey;
    @Column(nullable=false,columnDefinition="jsonb") @ColumnTransformer(write="?::jsonb") public String document;
    @Column(name="created_at",nullable=false) public Instant createdAt=Instant.now();
    protected AlertEntity(){}
    public AlertEntity(UUID id,String key,String document){this.id=id;this.alertKey=key;this.document=document;}
}
