import { ethers } from 'hardhat';
import { Contract, ContractFactory } from 'ethers';

/**
 * STAMP Cross-Jurisdiction Verification Network Deployment Script
 * 
 * This script deploys the smart contracts needed for the decentralized
 * trust network that enables cross-jurisdiction attendance verification.
 */

interface DeploymentConfig {
  networkName: string;
  jurisdictionName: string;
  initialValidators: string[];
  trustedPartners?: string[];
}

async function deployJurisdictionVerifier(): Promise<Contract> {
  console.log('📋 Deploying JurisdictionVerifier contract...');
  
  const JurisdictionVerifier: ContractFactory = await ethers.getContractFactory('JurisdictionVerifier');
  const contract = await JurisdictionVerifier.deploy();
  
  await contract.deployed();
  
  console.log(`✅ JurisdictionVerifier deployed to: ${contract.address}`);
  console.log(`📝 Transaction hash: ${contract.deployTransaction.hash}`);
  
  return contract;
}

async function registerJurisdiction(
  contract: Contract,
  config: DeploymentConfig
): Promise<void> {
  console.log(`🏛️  Registering jurisdiction: ${config.jurisdictionName}`);
  
  // Generate public key hash (in production, this would be derived from actual keys)
  const publicKeyHash = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes(`${config.jurisdictionName}-pubkey`)
  );
  
  const tx = await contract.registerJurisdiction(
    publicKeyHash,
    config.jurisdictionName
  );
  
  await tx.wait();
  
  console.log(`✅ Jurisdiction registered with hash: ${publicKeyHash}`);
}

async function authorizeValidators(
  contract: Contract,
  validators: string[]
): Promise<void> {
  console.log('👥 Authorizing validators...');
  
  for (const validator of validators) {
    const tx = await contract.authorizeValidator(validator);
    await tx.wait();
    console.log(`✅ Authorized validator: ${validator}`);
  }
}

async function establishTrustRelationships(
  contract: Contract,
  trustedPartners: string[]
): Promise<void> {
  if (!trustedPartners.length) {
    console.log('⏭️  No trusted partners specified, skipping trust establishment');
    return;
  }
  
  console.log('🤝 Establishing trust relationships...');
  
  for (const partner of trustedPartners) {
    try {
      const tx = await contract.establishTrust(partner);
      await tx.wait();
      console.log(`✅ Trust established with: ${partner}`);
    } catch (error) {
      console.log(`⚠️  Failed to establish trust with ${partner}:`, error.message);
    }
  }
}

async function verifyDeployment(contract: Contract, config: DeploymentConfig): Promise<void> {
  console.log('🔍 Verifying deployment...');
  
  // Get current signer address
  const [signer] = await ethers.getSigners();
  
  // Verify jurisdiction registration
  const jurisdictionInfo = await contract.getJurisdictionInfo(signer.address);
  console.log(`📊 Jurisdiction Info:`, {
    name: jurisdictionInfo.jurisdictionName,
    address: jurisdictionInfo.jurisdictionAddress,
    trustScore: jurisdictionInfo.trustScore.toString(),
    isActive: jurisdictionInfo.isActive,
    registeredAt: new Date(jurisdictionInfo.registeredAt.toNumber() * 1000).toISOString()
  });
  
  // Verify validators
  for (const validator of config.initialValidators) {
    const isAuthorized = await contract.authorizedValidators(validator);
    console.log(`👤 Validator ${validator}: ${isAuthorized ? '✅ Authorized' : '❌ Not authorized'}`);
  }
  
  console.log('✅ Deployment verification completed');
}

async function createTestVerificationRequest(contract: Contract): Promise<void> {
  console.log('🧪 Creating test verification request...');
  
  const [signer] = await ethers.getSigners();
  
  // Mock data for testing
  const stampHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('test-stamp-data'));
  const targetJurisdiction = signer.address; // Self-reference for testing
  const zkProof = ethers.utils.toUtf8Bytes('mock-zero-knowledge-proof-data');
  
  try {
    // First establish self-trust for testing
    const trustTx = await contract.establishTrust(signer.address);
    await trustTx.wait();
    
    const tx = await contract.requestVerification(
      stampHash,
      targetJurisdiction,
      zkProof
    );
    
    const receipt = await tx.wait();
    const event = receipt.events?.find(e => e.event === 'VerificationRequested');
    
    if (event) {
      console.log(`✅ Test verification request created with ID: ${event.args?.requestId}`);
    }
  } catch (error) {
    console.log(`⚠️  Test verification failed:`, error.message);
  }
}

async function main() {
  console.log('🚀 Starting STAMP Cross-Jurisdiction Verification Network Deployment');
  console.log('==================================================================');
  
  const [deployer] = await ethers.getSigners();
  console.log(`📱 Deploying with account: ${deployer.address}`);
  console.log(`💰 Account balance: ${ethers.utils.formatEther(await deployer.getBalance())} ETH`);
  
  // Configuration for deployment
  const config: DeploymentConfig = {
    networkName: 'development',
    jurisdictionName: 'Development County Superior Court',
    initialValidators: [
      deployer.address, // In production, these would be separate validator addresses
      // Add more validator addresses as needed
    ],
    trustedPartners: [
      // Add addresses of partner jurisdictions if known
    ]
  };
  
  try {
    // 1. Deploy the main contract
    const contract = await deployJurisdictionVerifier();
    
    // 2. Register this jurisdiction
    await registerJurisdiction(contract, config);
    
    // 3. Authorize validators
    await authorizeValidators(contract, config.initialValidators);
    
    // 4. Establish trust relationships (if any)
    await establishTrustRelationships(contract, config.trustedPartners || []);
    
    // 5. Verify deployment
    await verifyDeployment(contract, config);
    
    // 6. Create a test verification request
    await createTestVerificationRequest(contract);
    
    console.log('');
    console.log('🎉 Deployment completed successfully!');
    console.log('');
    console.log('📋 Contract Addresses:');
    console.log(`   JurisdictionVerifier: ${contract.address}`);
    console.log('');
    console.log('🔧 Next Steps:');
    console.log('   1. Share contract address with partner jurisdictions');
    console.log('   2. Have partners register their jurisdictions');
    console.log('   3. Establish mutual trust relationships');
    console.log('   4. Begin cross-jurisdiction verification');
    console.log('');
    console.log('💡 Integration:');
    console.log('   Add the contract address to your backend environment:');
    console.log(`   BLOCKCHAIN_VERIFIER_CONTRACT=${contract.address}`);
    
  } catch (error) {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  }
}

// Handle promise rejection
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment script failed:', error);
    process.exit(1);
  });