package com.polyflux.ulpf.storage;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
@Entity @Table(name="ulpf_bindings")
public class BindingEntity {
 @Id @Column(name="source_key",length=512) public String sourceKey;
 @Column(name="mapping_id",nullable=false,length=160) public String mappingId;
 @Column(nullable=false,length=32) public String version;
 protected BindingEntity(){}
 public BindingEntity(String sourceKey,String mappingId,String version){this.sourceKey=sourceKey;this.mappingId=mappingId;this.version=version;}
}
