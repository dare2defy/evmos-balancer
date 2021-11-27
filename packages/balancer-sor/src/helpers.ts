import { BigNumber } from './utils/bignumber';
import { getAddress } from '@ethersproject/address';
import {
    PoolPairData,
    Path,
    Pool,
    PoolDictionary,
    Swap,
    DisabledOptions,
    DisabledToken,
} from './types';
import {
    BONE,
    TWOBONE,
    MAX_IN_RATIO,
    MAX_OUT_RATIO,
    bmul,
    bdiv,
    bnum,
    calcOutGivenIn,
    calcInGivenOut,
    scale,
} from './bmath';
const disabledTokensDefault = require('./disabled-tokens.json');

export function toChecksum(address) {
    return getAddress(address);
}

export function getLimitAmountSwap(
    poolPairData: PoolPairData,
    swapType: string
): BigNumber {
    if (swapType === 'swapExactIn') {
        return bmul(poolPairData.balanceIn, MAX_IN_RATIO);
    } else {
        return bmul(poolPairData.balanceOut, MAX_OUT_RATIO);
    }
}

export function getLimitAmountSwapPath(
    pools: PoolDictionary,
    path: Path,
    swapType: string,
    poolPairData: any
): BigNumber {
    let swaps: Swap[] = path.swaps;
    if (swaps.length == 1) {
        let id = `${swaps[0].pool}${swaps[0].tokenIn}${swaps[0].tokenOut}`;
        let poolPairDataSwap1 = poolPairData[id];
        return getLimitAmountSwap(poolPairDataSwap1.poolPairData, swapType);
    } else if (swaps.length == 2) {
        let id = `${swaps[0].pool}${swaps[0].tokenIn}${swaps[0].tokenOut}`;
        let poolPairDataSwap1 = poolPairData[id];
        id = `${swaps[1].pool}${swaps[1].tokenIn}${swaps[1].tokenOut}`;
        let poolPairDataSwap2 = poolPairData[id];

        if (swapType === 'swapExactIn') {
            return BigNumber.min(
                // The limit is either set by limit_IN of poolPairData 1 or indirectly by limit_IN of poolPairData 2
                getLimitAmountSwap(poolPairDataSwap1.poolPairData, swapType),
                bmul(
                    getLimitAmountSwap(
                        poolPairDataSwap2.poolPairData,
                        swapType
                    ),
                    poolPairDataSwap1.sp
                ) // we need to multiply the limit_IN of
                // poolPairData 2 by the spotPrice of poolPairData 1 to get the equivalent in token IN
            );
        } else {
            return BigNumber.min(
                // The limit is either set by limit_OUT of poolPairData 2 or indirectly by limit_OUT of poolPairData 1
                getLimitAmountSwap(poolPairDataSwap2.poolPairData, swapType),
                bdiv(
                    getLimitAmountSwap(
                        poolPairDataSwap1.poolPairData,
                        swapType
                    ),
                    poolPairDataSwap2.sp
                ) // we need to divide the limit_OUT of
                // poolPairData 1 by the spotPrice of poolPairData 2 to get the equivalent in token OUT
            );
        }
    } else {
        throw new Error('Path with more than 2 swaps not supported');
    }
}

export function getSpotPricePath(
    pools: PoolDictionary,
    path: Path,
    poolPairData: any
): BigNumber {
    let swaps = path.swaps;
    if (swaps.length == 1) {
        let id = `${swaps[0].pool}${swaps[0].tokenIn}${swaps[0].tokenOut}`;
        let poolPairDataSwap1 = poolPairData[id];
        return poolPairDataSwap1.sp;
    } else if (swaps.length == 2) {
        let id = `${swaps[0].pool}${swaps[0].tokenIn}${swaps[0].tokenOut}`;
        let poolPairDataSwap1 = poolPairData[id];
        id = `${swaps[1].pool}${swaps[1].tokenIn}${swaps[1].tokenOut}`;
        let poolPairDataSwap2 = poolPairData[id];

        return bmul(poolPairDataSwap1.sp, poolPairDataSwap2.sp);
    } else {
        throw new Error('Path with more than 2 swaps not supported');
    }
}

export function getSpotPrice(poolPairData: PoolPairData): BigNumber {
    let inRatio = bdiv(poolPairData.balanceIn, poolPairData.weightIn);
    let outRatio = bdiv(poolPairData.balanceOut, poolPairData.weightOut);
    if (outRatio.isEqualTo(bnum(0))) {
        return bnum(0);
    } else {
        return bdiv(bdiv(inRatio, outRatio), BONE.minus(poolPairData.swapFee));
    }
}

export function getSlippageLinearizedSpotPriceAfterSwapPath(
    pools: PoolDictionary,
    path: Path,
    swapType: string,
    poolPairData: any
): BigNumber {
    let swaps: Swap[] = path.swaps;
    if (swaps.length == 1) {
        let id = `${swaps[0].pool}${swaps[0].tokenIn}${swaps[0].tokenOut}`;
        let poolPairDataSwap1: PoolPairData = poolPairData[id].poolPairData;

        return getSlippageLinearizedSpotPriceAfterSwap(
            poolPairDataSwap1,
            swapType
        );
    } else if (swaps.length == 2) {
        let id = `${swaps[0].pool}${swaps[0].tokenIn}${swaps[0].tokenOut}`;
        let p1: PoolPairData = poolPairData[id].poolPairData;

        id = `${swaps[1].pool}${swaps[1].tokenIn}${swaps[1].tokenOut}`;
        let p2: PoolPairData = poolPairData[id].poolPairData;

        if (
            p1.balanceIn.isEqualTo(bnum(0)) ||
            p2.balanceIn.isEqualTo(bnum(0))
        ) {
            return bnum(0);
        } else {
            // Since the numerator is the same for both 'swapExactIn' and 'swapExactOut' we do this first
            // See formulas on https://one.wolframcloud.com/env/fernando.martinel/SOR_multihop_analysis.nb
            let numerator1 = bmul(
                bmul(
                    bmul(BONE.minus(p1.swapFee), BONE.minus(p2.swapFee)), // In mathematica both terms are the negative (which compensates)
                    p1.balanceOut
                ),
                bmul(p1.weightIn, p2.weightIn)
            );

            let numerator2 = bmul(
                bmul(
                    p1.balanceOut.plus(p2.balanceIn),
                    BONE.minus(p1.swapFee) // In mathematica this is the negative but we add (instead of subtracting) numerator2 to compensate
                ),
                bmul(p1.weightIn, p2.weightOut)
            );

            let numerator3 = bmul(
                p2.balanceIn,
                bmul(p1.weightOut, p2.weightOut)
            );

            let numerator = numerator1.plus(numerator2).plus(numerator3);

            // The denominator is different for 'swapExactIn' and 'swapExactOut'
            if (swapType === 'swapExactIn') {
                let denominator1 = bmul(p1.balanceIn, p1.weightOut);
                let denominator2 = bmul(p2.balanceIn, p2.weightOut);

                return bdiv(bdiv(numerator, denominator1), denominator2);
            } else {
                let denominator1 = bmul(
                    BONE.minus(p1.swapFee),
                    bmul(p1.balanceOut, p1.weightIn)
                );
                let denominator2 = bmul(
                    BONE.minus(p2.swapFee),
                    bmul(p2.balanceOut, p2.weightIn)
                );

                return bdiv(bdiv(numerator, denominator1), denominator2);
            }
        }
    } else {
        throw new Error('Path with more than 2 swaps not supported');
    }
}

export function getSlippageLinearizedSpotPriceAfterSwap(
    poolPairData: PoolPairData,
    swapType: string
): BigNumber {
    let { weightIn, weightOut, balanceIn, balanceOut, swapFee } = poolPairData;
    if (swapType === 'swapExactIn') {
        if (balanceIn.isEqualTo(bnum(0))) {
            return bnum(0);
        } else {
            return bdiv(
                bmul(BONE.minus(swapFee), bdiv(weightIn, weightOut)).plus(BONE),
                balanceIn
            );
        }
    } else {
        if (balanceOut.isEqualTo(bnum(0))) {
            return bnum(0);
        } else {
            return bdiv(
                bdiv(weightOut, bmul(BONE.minus(swapFee), weightIn)).plus(BONE),
                balanceOut
            );
        }
    }
}

export function getReturnAmountSwapPath(
    pools: PoolDictionary,
    path: Path,
    swapType: string,
    amount: BigNumber
): BigNumber {
    let swaps = path.swaps;
    if (swaps.length == 1) {
        let swap1 = swaps[0];
        let poolSwap1 = pools[swap1.pool];
        let poolPairDataSwap1 = parsePoolPairData(
            poolSwap1,
            swap1.tokenIn,
            swap1.tokenOut
        );
        return getReturnAmountSwap(pools, poolPairDataSwap1, swapType, amount);
    } else if (swaps.length == 2) {
        let swap1 = swaps[0];
        let poolSwap1 = pools[swap1.pool];
        let poolPairDataSwap1 = parsePoolPairData(
            poolSwap1,
            swap1.tokenIn,
            swap1.tokenOut
        );

        let swap2 = swaps[1];
        let poolSwap2 = pools[swap2.pool];
        let poolPairDataSwap2 = parsePoolPairData(
            poolSwap2,
            swap2.tokenIn,
            swap2.tokenOut
        );

        if (swapType === 'swapExactIn') {
            // The outputAmount is number of tokenOut we receive from the second poolPairData
            let returnAmountSwap1 = getReturnAmountSwap(
                pools,
                poolPairDataSwap1,
                swapType,
                amount
            );

            return getReturnAmountSwap(
                pools,
                poolPairDataSwap2,
                swapType,
                returnAmountSwap1
            );
        } else {
            // The outputAmount is number of tokenIn we send to the first poolPairData
            let returnAmountSwap2 = getReturnAmountSwap(
                pools,
                poolPairDataSwap2,
                swapType,
                amount
            );
            return getReturnAmountSwap(
                pools,
                poolPairDataSwap1,
                swapType,
                returnAmountSwap2
            );
        }
    } else {
        throw new Error('Path with more than 2 swaps not supported');
    }
}

export function getReturnAmountSwap(
    pools: PoolDictionary,
    poolPairData: PoolPairData,
    swapType: string,
    amount: BigNumber
): BigNumber {
    let {
        weightIn,
        weightOut,
        balanceIn,
        balanceOut,
        swapFee,
        tokenIn,
        tokenOut,
    } = poolPairData;
    let returnAmount: BigNumber;

    if (swapType === 'swapExactIn') {
        if (balanceIn.isEqualTo(bnum(0))) {
            return bnum(0);
        } else {
            returnAmount = calcOutGivenIn(
                balanceIn,
                weightIn,
                balanceOut,
                weightOut,
                amount,
                swapFee
            );
            // Update balances of tokenIn and tokenOut
            pools[poolPairData.id] = updateTokenBalanceForPool(
                pools[poolPairData.id],
                tokenIn,
                balanceIn.plus(amount)
            );
            pools[poolPairData.id] = updateTokenBalanceForPool(
                pools[poolPairData.id],
                tokenOut,
                balanceOut.minus(returnAmount)
            );
            return returnAmount;
        }
    } else {
        if (balanceOut.isEqualTo(bnum(0))) {
            return bnum(0);
        } else {
            returnAmount = calcInGivenOut(
                balanceIn,
                weightIn,
                balanceOut,
                weightOut,
                amount,
                swapFee
            );
            // Update balances of tokenIn and tokenOut
            pools[poolPairData.id] = updateTokenBalanceForPool(
                pools[poolPairData.id],
                tokenIn,
                balanceIn.plus(returnAmount)
            );
            pools[poolPairData.id] = updateTokenBalanceForPool(
                pools[poolPairData.id],
                tokenOut,
                balanceOut.minus(amount)
            );
            return returnAmount;
        }
    }
}

// Updates the balance of a given token for a given pool passed as parameter
export function updateTokenBalanceForPool(
    pool: any,
    token: string,
    balance: BigNumber
): any {
    // console.log("pool")
    // console.log(pool)
    // console.log("token")
    // console.log(token)
    // console.log("balance")
    // console.log(balance)

    // Scale down back as balances are stored scaled down by the decimals
    let T = pool.tokens.find(t => t.address === token);
    T.balance = balance;
    return pool;
}

// Based on the function of same name of file onchain-sor in file: BRegistry.sol
// Normalized liquidity is not used in any calculationf, but instead for comparison between poolPairDataList only
// so we can find the most liquid poolPairData considering the effect of uneven weigths
export function getNormalizedLiquidity(poolPairData: PoolPairData): BigNumber {
    let { weightIn, weightOut, balanceIn, balanceOut, swapFee } = poolPairData;
    return bdiv(bmul(balanceOut, weightIn), weightIn.plus(weightOut));
}

// LEGACY FUNCTION - Keep Input/Output Format
export const parsePoolData = (
    directPools: PoolDictionary,
    tokenIn: string,
    tokenOut: string,
    mostLiquidPoolsFirstHop: Pool[] = [],
    mostLiquidPoolsSecondHop: Pool[] = [],
    hopTokens: string[] = []
): [PoolDictionary, Path[]] => {
    let pathDataList: Path[] = [];
    let pools: PoolDictionary = {};

    // First add direct pair paths
    for (let idKey in directPools) {
        let p: Pool = directPools[idKey];
        // Add pool to the set with all pools (only adds if it's still not present in dict)
        pools[idKey] = p;

        let swap: Swap = {
            pool: p.id,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
        };

        let path: Path = {
            id: p.id,
            swaps: [swap],
        };
        pathDataList.push(path);
    }

    // Now add multi-hop paths.
    // mostLiquidPoolsFirstHop and mostLiquidPoolsSecondHop always has the same
    // lengh of hopTokens
    for (let i = 0; i < hopTokens.length; i++) {
        // Add pools to the set with all pools (only adds if it's still not present in dict)
        pools[mostLiquidPoolsFirstHop[i].id] = mostLiquidPoolsFirstHop[i];
        pools[mostLiquidPoolsSecondHop[i].id] = mostLiquidPoolsSecondHop[i];

        let swap1: Swap = {
            pool: mostLiquidPoolsFirstHop[i].id,
            tokenIn: tokenIn,
            tokenOut: hopTokens[i],
        };

        let swap2: Swap = {
            pool: mostLiquidPoolsSecondHop[i].id,
            tokenIn: hopTokens[i],
            tokenOut: tokenOut,
        };

        let path: Path = {
            id: mostLiquidPoolsFirstHop[i].id + mostLiquidPoolsSecondHop[i].id, // Path id is the concatenation of the ids of poolFirstHop and poolSecondHop
            swaps: [swap1, swap2],
        };
        pathDataList.push(path);
    }
    return [pools, pathDataList];
};

export const parsePoolPairData = (
    p: Pool,
    tokenIn: string,
    tokenOut: string
): PoolPairData => {
    let tI = p.tokens.find(t => getAddress(t.address) === getAddress(tokenIn));
    // console.log("tI")
    // console.log(tI.balance.toString());
    // console.log(tI)
    let tO = p.tokens.find(t => getAddress(t.address) === getAddress(tokenOut));

    // console.log("tO")
    // console.log(tO.balance.toString());
    // console.log(tO)

    let poolPairData = {
        id: p.id,
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        decimalsIn: tI.decimals,
        decimalsOut: tO.decimals,
        balanceIn: bnum(tI.balance),
        balanceOut: bnum(tO.balance),
        weightIn: scale(bnum(tI.denormWeight).div(bnum(p.totalWeight)), 18),
        weightOut: scale(bnum(tO.denormWeight).div(bnum(p.totalWeight)), 18),
        swapFee: bnum(p.swapFee),
    };

    return poolPairData;
};

function filterPoolsWithoutToken(pools, token) {
    let found;
    let OutputPools = {};
    for (let i in pools) {
        found = false;
        for (let k = 0; k < pools[i].tokensList.length; k++) {
            if (pools[i].tokensList[k].toLowerCase() == token.toLowerCase()) {
                found = true;
                break;
            }
        }
        //Add pool if token not found
        if (!found) OutputPools[i] = pools[i];
    }
    return OutputPools;
}

// Inputs:
// - pools: All pools that contain a token
// - token: Token for which we are looking for pairs
// Outputs:
// - tokens: Set (without duplicate elements) of all tokens that pair with token
function getTokensPairedToTokenWithinPools(pools, token) {
    let found;
    let tokens = new Set();
    for (let i in pools) {
        found = false;
        for (let k = 0; k < pools[i].tokensList.length; k++) {
            if (
                getAddress(pools[i].tokensList[k]) != getAddress(token) &&
                pools[i].tokens.find(
                    t =>
                        getAddress(t.address) ===
                        getAddress(pools[i].tokensList[k])
                ).balance != 0
            ) {
                tokens.add(pools[i].tokensList[k]);
            }
        }
    }
    return tokens;
}

// Returns two arrays
// First array contains all tokens in direct pools containing tokenIn
// Second array contains all tokens in multi-hop pools containing tokenIn
export function getTokenPairsMultiHop(token: string, poolsTokensListSet: any) {
    let poolsWithToken = [];
    let poolsWithoutToken = [];

    let directTokenPairsSet = new Set();

    // If pool contains token add all its tokens to direct list
    poolsTokensListSet.forEach((poolTokenList, index) => {
        if (poolTokenList.includes(token)) {
            poolsWithToken.push(poolTokenList);
        } else {
            poolsWithoutToken.push(poolTokenList);
        }
    });

    directTokenPairsSet = new Set([].concat(...poolsWithToken));

    let multihopTokenPools = [];
    let multihopTokenPairsSet = new Set();

    poolsWithoutToken.forEach((pool, index) => {
        let intersection = [...pool].filter(x =>
            [...directTokenPairsSet].includes(x)
        );
        if (intersection.length != 0) {
            multihopTokenPools.push(pool);
        }
    });

    multihopTokenPairsSet = new Set([].concat(...multihopTokenPools));
    let allTokenPairsSet = new Set();
    allTokenPairsSet = new Set([
        ...directTokenPairsSet,
        ...multihopTokenPairsSet,
    ]);

    let directTokenPairs = [...directTokenPairsSet];
    let allTokenPairs = [...allTokenPairsSet];
    return [directTokenPairs, allTokenPairs];
}

// Filters all pools data to find pools that have both tokens
// TODO: Check for balance > 0
export function filterPoolsWithTokensDirect(
    allPools: Pool[], // The complete information of the pools
    tokenIn: string,
    tokenOut: string,
    disabledOptions: DisabledOptions = { isOverRide: false, disabledTokens: [] }
): PoolDictionary {
    let poolsWithTokens: PoolDictionary = {};
    // If pool contains token add all its tokens to direct list

    let disabledTokens = disabledTokensDefault.tokens;
    if (disabledOptions.isOverRide)
        disabledTokens = disabledOptions.disabledTokens;

    allPools.forEach(pool => {
        let tokenListSet = new Set(pool.tokensList);
        disabledTokens.forEach(token => tokenListSet.delete(token.address));

        if (tokenListSet.has(tokenIn) && tokenListSet.has(tokenOut)) {
            poolsWithTokens[pool.id] = pool;
        }
    });

    return poolsWithTokens;
}

// Returns two pool lists. One with all pools containing tokenOne and not tokenTwo and one with tokenTwo not tokenOn.
export function filterPoolsWithoutMutualTokens(
    allPools: Pool[],
    tokenOne: string,
    tokenTwo: string,
    disabledTokens: DisabledToken[] = []
): [PoolDictionary, Set<string>, PoolDictionary, Set<string>] {
    let tokenOnePools: PoolDictionary = {};
    let tokenTwoPools: PoolDictionary = {};
    let tokenOnePairedTokens: Set<string> = new Set();
    let tokenTwoPairedTokens: Set<string> = new Set();

    allPools.forEach(pool => {
        let poolTokensSET = new Set(pool.tokensList);
        disabledTokens.forEach(token => poolTokensSET.delete(token.address));
        if (poolTokensSET.size < 2) {
            return;
        }

        let containsTokenOne = poolTokensSET.has(tokenOne);
        let containsTokenTwo = poolTokensSET.has(tokenTwo);

        if (containsTokenOne && !containsTokenTwo) {
            tokenOnePairedTokens = new Set([
                ...tokenOnePairedTokens,
                ...poolTokensSET,
            ]);
            tokenOnePools[pool.id] = pool;
        } else if (!containsTokenOne && containsTokenTwo) {
            tokenTwoPairedTokens = new Set([
                ...tokenTwoPairedTokens,
                ...poolTokensSET,
            ]);
            tokenTwoPools[pool.id] = pool;
        }
    });

    return [
        tokenOnePools,
        tokenOnePairedTokens,
        tokenTwoPools,
        tokenTwoPairedTokens,
    ];
}

// Replacing getMultihopPoolsWithTokens
export function filterPoolsWithTokensMultihop(
    allPools: Pool[], // Just the list of pool tokens
    tokenIn: string,
    tokenOut: string,
    disabledOptions: DisabledOptions = { isOverRide: false, disabledTokens: [] }
): [Pool[], Pool[], string[]] {
    //// Multi-hop trades: we find the best pools that connect tokenIn and tokenOut through a multi-hop (intermediate) token
    // First: we get all tokens that can be used to be traded with tokenIn excluding
    // tokens that are in pools that already contain tokenOut (in which case multi-hop is not necessary)
    let poolsTokenInNoTokenOut: PoolDictionary;
    let tokenInHopTokens: Set<string>;
    let poolsTokenOutNoTokenIn: PoolDictionary;
    let tokenOutHopTokens: Set<string>;

    let disabledTokens = disabledTokensDefault.tokens;
    if (disabledOptions.isOverRide)
        disabledTokens = disabledOptions.disabledTokens;

    // STOPPED HERE: poolsTokenInNoTokenOut NEEDS
    [
        poolsTokenInNoTokenOut,
        tokenInHopTokens,
        poolsTokenOutNoTokenIn,
        tokenOutHopTokens,
    ] = filterPoolsWithoutMutualTokens(
        allPools,
        tokenIn,
        tokenOut,
        disabledTokens
    );

    // Third: we find the intersection of the two previous sets so we can trade tokenIn for tokenOut with 1 multi-hop
    const hopTokensSet = [...tokenInHopTokens].filter(x =>
        tokenOutHopTokens.has(x)
    );

    // Transform set into Array
    const hopTokens: string[] = [...hopTokensSet];
    // console.log(hopTokens);

    // Find the most liquid pool for each pair (tokenIn -> hopToken). We store an object in the form:
    // mostLiquidPoolsFirstHop = {hopToken1: mostLiquidPool, hopToken2: mostLiquidPool, ... , hopTokenN: mostLiquidPool}
    // Here we could query subgraph for all pools with pair (tokenIn -> hopToken), but to
    // minimize subgraph calls we loop through poolsTokenInNoTokenOut, and check the liquidity
    // only for those that have hopToken
    let mostLiquidPoolsFirstHop: Pool[] = [];
    for (let i = 0; i < hopTokens.length; i++) {
        let highestNormalizedLiquidity = bnum(0); // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
        let highestNormalizedLiquidityPoolId; // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
        for (let k in poolsTokenInNoTokenOut) {
            // If this pool has hopTokens[i] calculate its normalized liquidity
            if (
                new Set(poolsTokenInNoTokenOut[k].tokensList).has(hopTokens[i])
            ) {
                let normalizedLiquidity = getNormalizedLiquidity(
                    parsePoolPairData(
                        poolsTokenInNoTokenOut[k],
                        tokenIn,
                        hopTokens[i].toString()
                    )
                );

                if (
                    normalizedLiquidity.isGreaterThanOrEqualTo(
                        // Cannot be strictly greater otherwise
                        // highestNormalizedLiquidityPoolId = 0 if hopTokens[i] balance is 0 in this pool.
                        highestNormalizedLiquidity
                    )
                ) {
                    highestNormalizedLiquidity = normalizedLiquidity;
                    highestNormalizedLiquidityPoolId = k;
                }
            }
        }
        mostLiquidPoolsFirstHop[i] =
            poolsTokenInNoTokenOut[highestNormalizedLiquidityPoolId];
        // console.log(highestNormalizedLiquidity)
        // console.log(mostLiquidPoolsFirstHop)
    }

    // console.log('mostLiquidPoolsFirstHop');
    // console.log(mostLiquidPoolsFirstHop);

    // Now similarly find the most liquid pool for each pair (hopToken -> tokenOut)
    let mostLiquidPoolsSecondHop: Pool[] = [];
    for (let i = 0; i < hopTokens.length; i++) {
        let highestNormalizedLiquidity = bnum(0); // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
        let highestNormalizedLiquidityPoolId; // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
        for (let k in poolsTokenOutNoTokenIn) {
            // If this pool has hopTokens[i] calculate its normalized liquidity
            if (
                new Set(poolsTokenOutNoTokenIn[k].tokensList).has(hopTokens[i])
            ) {
                let normalizedLiquidity = getNormalizedLiquidity(
                    parsePoolPairData(
                        poolsTokenOutNoTokenIn[k],
                        hopTokens[i].toString(),
                        tokenOut
                    )
                );

                if (
                    normalizedLiquidity.isGreaterThanOrEqualTo(
                        // Cannot be strictly greater otherwise
                        // highestNormalizedLiquidityPoolId = 0 if hopTokens[i] balance is 0 in this pool.
                        highestNormalizedLiquidity
                    )
                ) {
                    highestNormalizedLiquidity = normalizedLiquidity;
                    highestNormalizedLiquidityPoolId = k;
                }
            }
        }
        mostLiquidPoolsSecondHop[i] =
            poolsTokenOutNoTokenIn[highestNormalizedLiquidityPoolId];
        // console.log(highestNormalizedLiquidity)
        // console.log(mostLiquidPoolsSecondHop)
    }
    return [mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop, hopTokens];
}

export const formatSubgraphPools = pools => {
    for (let pool of pools.pools) {
        pool.swapFee = scale(bnum(pool.swapFee), 18);
        pool.totalWeight = scale(bnum(pool.totalWeight), 18);
        pool.tokens.forEach(token => {
            token.balance = scale(bnum(token.balance), token.decimals);
            token.denormWeight = scale(bnum(token.denormWeight), 18);
        });
    }
};

export function filterPools(
    allPools: Pool[], // The complete information of the pools
    tokenIn: string,
    tokenOut: string,
    disabledOptions: DisabledOptions = { isOverRide: false, disabledTokens: [] }
): [PoolDictionary, string[], PoolDictionary, PoolDictionary] {
    // If pool contains token add all its tokens to direct list
    // Multi-hop trades: we find the best pools that connect tokenIn and tokenOut through a multi-hop (intermediate) token
    // First: we get all tokens that can be used to be traded with tokenIn excluding
    // tokens that are in pools that already contain tokenOut (in which case multi-hop is not necessary)
    let poolsDirect: PoolDictionary = {};
    let poolsTokenOne: PoolDictionary = {};
    let poolsTokenTwo: PoolDictionary = {};
    let tokenInPairedTokens: Set<string> = new Set();
    let tokenOutPairedTokens: Set<string> = new Set();

    let disabledTokens = disabledTokensDefault.tokens;
    if (disabledOptions.isOverRide)
        disabledTokens = disabledOptions.disabledTokens;

    allPools.forEach(pool => {
        let tokenListSet = new Set(pool.tokensList);
        disabledTokens.forEach(token => tokenListSet.delete(token.address));

        if (tokenListSet.has(tokenIn) && tokenListSet.has(tokenOut)) {
            poolsDirect[pool.id] = pool;
            return;
        }

        let containsTokenIn = tokenListSet.has(tokenIn);
        let containsTokenOut = tokenListSet.has(tokenOut);

        if (containsTokenIn && !containsTokenOut) {
            tokenInPairedTokens = new Set([
                ...tokenInPairedTokens,
                ...tokenListSet,
            ]);
            poolsTokenOne[pool.id] = pool;
        } else if (!containsTokenIn && containsTokenOut) {
            tokenOutPairedTokens = new Set([
                ...tokenOutPairedTokens,
                ...tokenListSet,
            ]);
            poolsTokenTwo[pool.id] = pool;
        }
    });

    // We find the intersection of the two previous sets so we can trade tokenIn for tokenOut with 1 multi-hop
    const hopTokensSet = [...tokenInPairedTokens].filter(x =>
        tokenOutPairedTokens.has(x)
    );

    // Transform set into Array
    const hopTokens: string[] = [...hopTokensSet];

    return [poolsDirect, hopTokens, poolsTokenOne, poolsTokenTwo];
}

export function sortPoolsMostLiquid(
    tokenIn: string,
    tokenOut: string,
    hopTokens: string[],
    poolsTokenInNoTokenOut: PoolDictionary,
    poolsTokenOutNoTokenIn: PoolDictionary
): [Pool[], Pool[]] {
    // Find the most liquid pool for each pair (tokenIn -> hopToken). We store an object in the form:
    // mostLiquidPoolsFirstHop = {hopToken1: mostLiquidPool, hopToken2: mostLiquidPool, ... , hopTokenN: mostLiquidPool}
    // Here we could query subgraph for all pools with pair (tokenIn -> hopToken), but to
    // minimize subgraph calls we loop through poolsTokenInNoTokenOut, and check the liquidity
    // only for those that have hopToken
    let mostLiquidPoolsFirstHop: Pool[] = [];
    let mostLiquidPoolsSecondHop: Pool[] = [];
    let poolPair = {}; // Store pair liquidity incase it is reused

    for (let i = 0; i < hopTokens.length; i++) {
        let highestNormalizedLiquidityFirst = bnum(0); // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
        let highestNormalizedLiquidityFirstPoolId; // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)

        for (let k in poolsTokenInNoTokenOut) {
            // If this pool has hopTokens[i] calculate its normalized liquidity
            if (
                new Set(poolsTokenInNoTokenOut[k].tokensList).has(hopTokens[i])
            ) {
                let normalizedLiquidity = getNormalizedLiquidity(
                    parsePoolPairData(
                        poolsTokenInNoTokenOut[k],
                        tokenIn,
                        hopTokens[i].toString()
                    )
                );

                if (
                    normalizedLiquidity.isGreaterThanOrEqualTo(
                        // Cannot be strictly greater otherwise
                        // highestNormalizedLiquidityPoolId = 0 if hopTokens[i] balance is 0 in this pool.
                        highestNormalizedLiquidityFirst
                    )
                ) {
                    highestNormalizedLiquidityFirst = normalizedLiquidity;
                    highestNormalizedLiquidityFirstPoolId = k;
                }
            }
        }

        mostLiquidPoolsFirstHop[i] =
            poolsTokenInNoTokenOut[highestNormalizedLiquidityFirstPoolId];

        let highestNormalizedLiquidity = bnum(0); // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)
        let highestNormalizedLiquidityPoolId; // Aux variable to find pool with most liquidity for pair (tokenIn -> hopToken)

        for (let k in poolsTokenOutNoTokenIn) {
            // If this pool has hopTokens[i] calculate its normalized liquidity
            if (
                new Set(poolsTokenOutNoTokenIn[k].tokensList).has(hopTokens[i])
            ) {
                let normalizedLiquidity = getNormalizedLiquidity(
                    parsePoolPairData(
                        poolsTokenOutNoTokenIn[k],
                        hopTokens[i].toString(),
                        tokenOut
                    )
                );

                if (
                    normalizedLiquidity.isGreaterThanOrEqualTo(
                        // Cannot be strictly greater otherwise
                        // highestNormalizedLiquidityPoolId = 0 if hopTokens[i] balance is 0 in this pool.
                        highestNormalizedLiquidity
                    )
                ) {
                    highestNormalizedLiquidity = normalizedLiquidity;
                    highestNormalizedLiquidityPoolId = k;
                }
            }
        }
        mostLiquidPoolsSecondHop[i] =
            poolsTokenOutNoTokenIn[highestNormalizedLiquidityPoolId];
    }

    return [mostLiquidPoolsFirstHop, mostLiquidPoolsSecondHop];
}
