module.exports = {
  plugins: ["truffle-contract-size"],
  networks: {
    evmos: {
      host: "localhost", // Localhost (default: none)
      port: 8545, // Standard Ethereum port (default: none)
      network_id: "*", // Any network (default: none)
      gas: 6721975
    }
  },
  // Configure your compilers
  compilers: {
    solc: {
      version: "0.5.12",
      settings: {
        // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 100
        },
        evmVersion: "byzantium"
      }
    }
  }
};