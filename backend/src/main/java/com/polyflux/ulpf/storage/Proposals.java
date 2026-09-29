package com.polyflux.ulpf.storage;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
public interface Proposals extends JpaRepository<ProposalEntity, UUID> { List<ProposalEntity> findAllByOrderByCreatedAtDesc(); List<ProposalEntity> findBySourceKeyAndStatus(String sourceKey,String status); }
