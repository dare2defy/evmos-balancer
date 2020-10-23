'use strict';
var __awaiter =
    (this && this.__awaiter) ||
    function(thisArg, _arguments, P, generator) {
        function adopt(value) {
            return value instanceof P
                ? value
                : new P(function(resolve) {
                      resolve(value);
                  });
        }
        return new (P || (P = Promise))(function(resolve, reject) {
            function fulfilled(value) {
                try {
                    step(generator.next(value));
                } catch (e) {
                    reject(e);
                }
            }
            function rejected(value) {
                try {
                    step(generator['throw'](value));
                } catch (e) {
                    reject(e);
                }
            }
            function step(result) {
                result.done
                    ? resolve(result.value)
                    : adopt(result.value).then(fulfilled, rejected);
            }
            step(
                (generator = generator.apply(thisArg, _arguments || [])).next()
            );
        });
    };
var __importStar =
    (this && this.__importStar) ||
    function(mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null)
            for (var k in mod)
                if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
        result['default'] = mod;
        return result;
    };
Object.defineProperty(exports, '__esModule', { value: true });
const ethers_1 = require('ethers');
const bmath = __importStar(require('./bmath'));
function getAllPoolDataOnChain(pools, multiAddress, provider) {
    return __awaiter(this, void 0, void 0, function*() {
        if (pools.pools.length === 0)
            throw Error('There are no pools with selected tokens');
        const customMultiAbi = require('./abi/customMulticall.json');
        const contract = new ethers_1.Contract(
            multiAddress,
            customMultiAbi,
            provider
        );
        let addresses = [];
        let total = 0;
        for (let i = 0; i < pools.pools.length; i++) {
            let pool = pools.pools[i];
            addresses.push([pool.id]);
            total += 1;
            pool.tokens.forEach((token, tokenIndex) => {
                addresses[i].push(token.address);
                total += 2;
            });
        }
        try {
            let results = yield contract.getPoolInfo(addresses, total);
            let j = 0;
            let onChainPools = { pools: [] };
            for (let i = 0; i < pools.pools.length; i++) {
                let tokens = [];
                let p = {
                    id: pools.pools[i].id,
                    swapFee: bmath.bnum(results[j]),
                    totalWeight: bmath.scale(
                        bmath.bnum(pools.pools[i].totalWeight),
                        18
                    ),
                    tokens: tokens,
                    tokensList: pools.pools[i].tokensList,
                };
                j++;
                pools.pools[i].tokens.forEach(token => {
                    let bal = bmath.bnum(results[j]);
                    j++;
                    let dW = bmath.bnum(results[j]);
                    j++;
                    p.tokens.push({
                        address: token.address,
                        balance: bal,
                        decimals: Number(token.decimals),
                        denormWeight: dW,
                    });
                });
                onChainPools.pools.push(p);
            }
            return onChainPools;
        } catch (e) {
            console.error('Failure querying onchain balances', { error: e });
            return;
        }
    });
}
exports.getAllPoolDataOnChain = getAllPoolDataOnChain;
