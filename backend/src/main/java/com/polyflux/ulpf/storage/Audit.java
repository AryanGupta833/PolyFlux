package com.polyflux.ulpf.storage;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
public interface Audit extends JpaRepository<AuditEntity,Long> { List<AuditEntity> findTop300ByOrderByAtDesc(); }
