package com.polyflux.ulpf.storage;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
@Entity @Table(name="ulpf_audit_log")
public class AuditEntity {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
 @Column(nullable=false) public Instant at=Instant.now();
 @Column(nullable=false,length=160) public String action;
 @Column(nullable=false,columnDefinition="text") public String detail;
 protected AuditEntity(){}
 public AuditEntity(String action,String detail){this.action=action;this.detail=detail;}
}
