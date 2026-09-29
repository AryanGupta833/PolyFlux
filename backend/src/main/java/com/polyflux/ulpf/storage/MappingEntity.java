package com.polyflux.ulpf.storage;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.hibernate.annotations.ColumnTransformer;
import java.io.Serializable;

@Entity @Table(name="ulpf_mappings") @IdClass(MappingEntity.Key.class)
public class MappingEntity {
    @Id @Column(name="mapping_id",length=160) public String mappingId;
    @Id @Column(length=32) public String version;
    @Column(nullable=false,length=160) public String parser;
    @Column(name="source_key",length=512) public String sourceKey;
    @Column(nullable=false) public boolean builtin;
    @Column(nullable=false,columnDefinition="jsonb") @ColumnTransformer(write="?::jsonb") public String document;
    public static class Key implements Serializable { public String mappingId; public String version; public Key(){} public Key(String id,String version){this.mappingId=id;this.version=version;} }
    protected MappingEntity() { }
    public MappingEntity(String id,String version,String parser,String sourceKey,boolean builtin,String document){this.mappingId=id;this.version=version;this.parser=parser;this.sourceKey=sourceKey;this.builtin=builtin;this.document=document;}
}
