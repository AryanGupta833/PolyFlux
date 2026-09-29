package com.polyflux.ulpf.storage;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
public interface Alerts extends JpaRepository<AlertEntity, UUID> { List<AlertEntity> findAllByOrderByCreatedAtDesc(); }
