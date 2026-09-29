package com.polyflux.ulpf.storage;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="ulpf_proposals")
public class ProposalEntity {
    @Id public UUID id;
    @Column(name="source_key",nullable=false,length=512) public String sourceKey;
    @Column(nullable=false,length=32) public String kind;
    @Column(nullable=false,length=32) public String status;
    @Column(nullable=false,columnDefinition="jsonb") @ColumnTransformer(write="?::jsonb") public String document;
    @Column(name="created_at",nullable=false) public Instant createdAt=Instant.now();
    protected ProposalEntity(){}
    public ProposalEntity(UUID id,String sourceKey,String kind,String status,String document){this.id=id;this.sourceKey=sourceKey;this.kind=kind;this.status=status;this.document=document;}
}
