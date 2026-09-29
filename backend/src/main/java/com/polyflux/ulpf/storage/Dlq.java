package com.polyflux.ulpf.storage;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
public interface Dlq extends JpaRepository<DlqEntity, UUID> { List<DlqEntity> findAllByOrderByCreatedAtDesc(); }
