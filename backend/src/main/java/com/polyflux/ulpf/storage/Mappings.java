package com.polyflux.ulpf.storage;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
public interface Mappings extends JpaRepository<MappingEntity, MappingEntity.Key> { List<MappingEntity> findAllByOrderByMappingIdAscVersionDesc(); }
