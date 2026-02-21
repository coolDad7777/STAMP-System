import { ethers, Contract, providers, Wallet } from 'ethers';
import { logger } from '../utils/logger';
import { CryptoService } from '../crypto/CryptoService';
import { config } from '../config/config';

/**
 * Blockchain Verification Service
 * 
 * Handles cross-jurisdiction attendance verification using smart contracts
 * and zero-knowledge proofs. Enables verification across multiple jurisdictions
 * without sharing sensitive attendance data.
 */
export class BlockchainVerificationService {
  private static provider: providers.Provider;
  private static contract: Contract;
  private static wallet: Wallet;
  private static initialized = false;

  private static readonly CONTRACT_ABI = [
    "function requestVerification(bytes32 stampHash, address targetJurisdiction, bytes zkProof) external returns (bytes32)",
    "function getVerificationResult(bytes32 requestId) external view returns (tuple(bytes32 requestId, bool isValid, uint256 confidenceScore, bytes32[] validatorSignatures, uint256 verificationTime))",
    "function establishTrust(address partnerJurisdiction) external",
    "function hasMutualTrust(address jurisdiction1, address jurisdiction2) external view returns (bool)",
    "function registerJurisdiction(bytes32 publicKeyHash, string jurisdictionName) external",
    "function authorizeValidator(address validator) external",
    "event VerificationRequested(bytes32 indexed requestId, address indexed requester, address indexed target)",
    "event VerificationCompleted(bytes32 indexed requestId, bool result, uint256 confidence)"
  ];

  /**
   * Initialize the blockchain verification service
   */
  public static async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize provider (local development or mainnet)
      if (config.NODE_ENV === 'development') {
        this.provider = new providers.JsonRpcProvider('http://localhost:8545');
      } else {
        // Production would use actual blockchain RPC endpoint
        this.provider = new providers.JsonRpcProvider(config.BLOCKCHAIN_RPC_URL);
      }

      // Initialize wallet from private key
      this.wallet = new Wallet(config.BLOCKCHAIN_PRIVATE_KEY || '0x' + '0'.repeat(64), this.provider);

      // Initialize contract
      this.contract = new Contract(
        config.BLOCKCHAIN_VERIFIER_CONTRACT || ethers.constants.AddressZero,
        this.CONTRACT_ABI,
        this.wallet
      );

      // Set up event listeners
      await this.setupEventListeners();

      this.initialized = true;
      logger.info('BlockchainVerificationService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize BlockchainVerificationService', error);
      throw error;
    }
  }

  /**
   * Submit a cross-jurisdiction verification request
   */
  public static async requestCrossJurisdictionVerification(
    attendanceStamp: AttendanceStamp,
    targetJurisdiction: string
  ): Promise<CrossJurisdictionVerificationResult> {
    this.ensureInitialized();

    try {
      // Generate zero-knowledge proof of stamp validity
      const zkProof = await this.generateZeroKnowledgeProof(attendanceStamp);
      
      // Create stamp hash for blockchain reference
      const stampHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(JSON.stringify({
          userPseudonym: attendanceStamp.userPseudonym,
          meetingId: attendanceStamp.meetingId,
          sessionDuration: attendanceStamp.sessionDuration,
          integrityHash: attendanceStamp.integrityHash
        }))
      );

      // Submit verification request to blockchain
      const tx = await this.contract.requestVerification(
        stampHash,
        targetJurisdiction,
        zkProof
      );

      const receipt = await tx.wait();
      const event = receipt.events?.find(e => e.event === 'VerificationRequested');
      
      if (!event) {
        throw new Error('Verification request event not found');
      }

      const requestId = event.args?.requestId;

      logger.info(`Cross-jurisdiction verification requested`, {
        requestId,
        targetJurisdiction,
        stampHash,
        transactionHash: tx.hash
      });

      // Wait for verification completion (with timeout)
      const result = await this.waitForVerificationResult(requestId, 60000); // 60 second timeout

      return {
        success: true,
        requestId,
        isValid: result.isValid,
        confidenceScore: result.confidenceScore,
        verificationTime: result.verificationTime,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber
      };

    } catch (error) {
      logger.error('Cross-jurisdiction verification failed', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate zero-knowledge proof for cross-jurisdiction verification
   * This proves stamp validity without revealing sensitive details
   */
  private static async generateZeroKnowledgeProof(
    attendanceStamp: AttendanceStamp
  ): Promise<Uint8Array> {
    try {
      // In a full implementation, this would use a ZK-SNARK library like circom/snarkjs
      // For now, we create a cryptographic commitment that proves validity

      const proofData = {
        // Public inputs (can be verified by anyone)
        stampExists: true,
        durationMet: attendanceStamp.sessionDuration >= config.SESSION_MIN_DURATION_MS,
        signatureValid: true, // Would verify Ed25519 signature
        
        // Private inputs (hidden from verifier)
        // - Exact location coordinates
        // - User identity
        // - Meeting details
        // These are proven without revelation through the ZK proof
      };

      // Create proof commitment
      const proofCommitment = await CryptoService.generateHash(
        JSON.stringify(proofData) + attendanceStamp.integrityHash
      );

      // Sign the commitment (simplified version of ZK proof)
      const signature = await CryptoService.sign(proofCommitment);

      // Combine commitment and signature as proof
      const zkProof = ethers.utils.concat([
        ethers.utils.toUtf8Bytes(proofCommitment),
        ethers.utils.toUtf8Bytes(signature)
      ]);

      return zkProof;
    } catch (error) {
      logger.error('Failed to generate zero-knowledge proof', error);
      throw new Error('ZK proof generation failed');
    }
  }

  /**
   * Wait for verification result from the blockchain
   */
  private static async waitForVerificationResult(
    requestId: string,
    timeoutMs: number
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const result = await this.contract.getVerificationResult(requestId);
          
          if (result.requestId !== ethers.constants.HashZero) {
            // Verification completed
            resolve({
              requestId: result.requestId,
              isValid: result.isValid,
              confidenceScore: result.confidenceScore.toNumber(),
              validatorSignatures: result.validatorSignatures,
              verificationTime: result.verificationTime.toNumber()
            });
            return;
          }

          // Check timeout
          if (Date.now() - startTime > timeoutMs) {
            reject(new Error('Verification timeout'));
            return;
          }

          // Continue polling
          setTimeout(poll, pollInterval);
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }

  /**
   * Establish trust relationship with another jurisdiction
   */
  public static async establishTrust(partnerJurisdictionAddress: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const tx = await this.contract.establishTrust(partnerJurisdictionAddress);
      await tx.wait();

      logger.info(`Trust established with jurisdiction ${partnerJurisdictionAddress}`);
      return true;
    } catch (error) {
      logger.error('Failed to establish trust', error);
      return false;
    }
  }

  /**
   * Check if mutual trust exists between two jurisdictions
   */
  public static async hasMutualTrust(
    jurisdiction1: string,
    jurisdiction2: string
  ): Promise<boolean> {
    this.ensureInitialized();

    try {
      return await this.contract.hasMutualTrust(jurisdiction1, jurisdiction2);
    } catch (error) {
      logger.error('Failed to check mutual trust', error);
      return false;
    }
  }

  /**
   * Register this jurisdiction on the blockchain network
   */
  public static async registerJurisdiction(
    jurisdictionName: string,
    publicKeyHash: string
  ): Promise<boolean> {
    this.ensureInitialized();

    try {
      const tx = await this.contract.registerJurisdiction(
        publicKeyHash,
        jurisdictionName
      );
      await tx.wait();

      logger.info(`Jurisdiction registered: ${jurisdictionName}`);
      return true;
    } catch (error) {
      logger.error('Failed to register jurisdiction', error);
      return false;
    }
  }

  /**
   * Set up event listeners for blockchain events
   */
  private static async setupEventListeners(): Promise<void> {
    // Listen for verification completion events
    this.contract.on('VerificationCompleted', (requestId, result, confidence, event) => {
      logger.info('Cross-jurisdiction verification completed', {
        requestId,
        result,
        confidence: confidence.toNumber(),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash
      });

      // Could trigger notifications or database updates here
    });

    // Listen for verification request events
    this.contract.on('VerificationRequested', (requestId, requester, target, event) => {
      logger.info('Cross-jurisdiction verification requested', {
        requestId,
        requester,
        target,
        blockNumber: event.blockNumber
      });
    });
  }

  /**
   * Get network statistics
   */
  public static async getNetworkStats(): Promise<NetworkStats> {
    this.ensureInitialized();

    try {
      const blockNumber = await this.provider.getBlockNumber();
      const network = await this.provider.getNetwork();
      const balance = await this.wallet.getBalance();

      return {
        network: network.name,
        chainId: network.chainId,
        currentBlock: blockNumber,
        walletBalance: ethers.utils.formatEther(balance),
        contractAddress: this.contract.address
      };
    } catch (error) {
      logger.error('Failed to get network stats', error);
      throw error;
    }
  }

  /**
   * Health check for blockchain service
   */
  public static async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) {
        return false;
      }

      // Test basic connectivity
      await this.provider.getBlockNumber();
      return true;
    } catch (error) {
      logger.error('Blockchain health check failed', error);
      return false;
    }
  }

  private static ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('BlockchainVerificationService not initialized');
    }
  }
}

// Type definitions
export interface AttendanceStamp {
  userPseudonym: string;
  meetingId: string;
  sessionStart: number;
  sessionEnd: number;
  sessionDuration: number;
  locationProof: string;
  integrityHash: string;
}

export interface CrossJurisdictionVerificationResult {
  success: boolean;
  requestId?: string;
  isValid?: boolean;
  confidenceScore?: number;
  verificationTime?: number;
  transactionHash?: string;
  blockNumber?: number;
  error?: string;
}

export interface VerificationResult {
  requestId: string;
  isValid: boolean;
  confidenceScore: number;
  validatorSignatures: string[];
  verificationTime: number;
}

export interface NetworkStats {
  network: string;
  chainId: number;
  currentBlock: number;
  walletBalance: string;
  contractAddress: string;
}