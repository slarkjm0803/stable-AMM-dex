import { ApprovalState, useApproveCallback } from '../hooks/useApproveCallback'
import { AutoRow, RowBetween } from '../components/Row'
import { ROUTER_ADDRESS } from '../constants'
import Button, { ButtonError } from '../components/Button'
import { Currency, JSBI, Percent } from '@sushiswap/sdk'
import Column, { AutoColumn } from '../components/Column'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { computeRealizedLPFeePercent, warningSeverity } from '../functions/prices'
import styled, { keyframes } from 'styled-components'
import { useDerivedZapInfo, useZapActionHandlers } from '../state/zap/hooks'
import { useUserSlippageToleranceWithDefault } from '../state/user/hooks'

import Alert from '../components/Alert'
import { AppDispatch } from '../state'
import { ArrowLeft } from 'react-feather'
import CurrencyInputPanel from '../components/CurrencyInputPanel'
import CurrencyLogo from '../components/CurrencyLogo'
import DoubleCurrencyLogo from '../components/DoubleLogo'
import FormattedPriceImpact from '../features/swap/FormattedPriceImpact'
import Head from 'next/head'
import Link from 'next/link'
import Loader from '../components/Loader'
import PoolList from '../components/PoolList'
import ProgressSteps from '../components/ProgressSteps'
import QuestionHelper from '../components/QuestionHelper'
import Router from 'next/router'
import SwapRoute from '../features/swap/SwapRoute'
import { BEAMCHEF_ADDRESS, ZAPPER_ADDRESS } from '../constants/addresses'
import { currencyId as getCurrencyId } from '../functions/currency/currencyId'
import { maxAmountSpend } from '../functions/currency/maxAmountSpend'
import { resetZapState } from '../state/zap/actions'
import { t } from '@lingui/macro'
import { useActiveWeb3React } from '../hooks/useActiveWeb3React'
import { useCurrency, useToken } from '../hooks/Tokens'
import { useDefaultsFromURLSearch } from '../state/zap/hooks'
import { useDispatch } from 'react-redux'
import { useLingui } from '@lingui/react'
import { usePairContract } from '../hooks/useContract'
import { useWalletModalToggle } from '../state/application/hooks'
import useZapper from '../hooks/useZapper'
import { NATIVE, WNATIVE } from '../sdk'
import { useTokenBalance } from '../state/wallet/hooks'
import { useV2LiquidityTokenPermit } from '../hooks/useERC20Permit'
import { tryParseAmount } from '../functions/parse'
import useMasterChef from '../features/farm/useMasterChef'
import { useTransactionAdder } from '../state/transactions/hooks'
import { POOLS } from '../constants/farms'
import { ethers } from 'ethers'
import DoubleGlowShadow from '../components/DoubleGlowShadow'

const PoolAllocationWrapper = styled.div`
  margin-top: 1rem;
  background-color: ${({ theme }) => theme.bg1};
  border-radius: 0.625rem 0.625rem 0 0;
  padding: 1rem;
`

const PoolBreakDownWrapper = styled.div`
  background-color: ${({ theme }) => theme.bg1};
  border-top: 1px solid rgba(42, 58, 80, 0.4);
  padding: 1rem
  border-radius: 0 0 0.625rem 0.625rem;
`

const StyledArrowLeft = styled(ArrowLeft)`
  color: ${({ theme }) => theme.text1};
`

const PoolTokenRow = styled.span`
  display: flex;
  margin: 10px 0;
`

const defaultHighlightColor = '#2b2f3e'
const defaultBaseColor = '#21262b'

const skeletonKeyframes = keyframes`
  0% {
    background-position: -200px 0;
  }
  100% {
    background-position: calc(200px + 100%) 0;
  }
`

const Skeleton = styled.span`
  background-color: ${defaultBaseColor};
  background-image: linear-gradient(90deg, ${defaultBaseColor}, ${defaultHighlightColor}, ${defaultBaseColor});
  background-size: 200px 100%;
  background-repeat: no-repeat;
  border-radius: 4px;
  animation: ${skeletonKeyframes} 2s infinite;
  display: inline-block;
  line-height: 1;
  width: 100%;
`

const CardHeader = () => {
  const dispatch = useDispatch<AppDispatch>()

  return (
    <AutoColumn>
      <RowBetween style={{ padding: '1rem 0rem 1rem' }}>
        <Link href="/zap">
          <a
            onClick={() => {
              dispatch(resetZapState())
            }}
          >
            <StyledArrowLeft />
          </a>
        </Link>
        <div
          style={{
            fontWeight: 500,
            fontSize: '22px',
            marginBottom: '20px',
          }}
          className="text-white"
        >
          Zap Liquidity
        </div>
        {/* <Settings /> */}
      </RowBetween>
      <RowBetween style={{ padding: '0rem 0rem 1rem' }}>
        <Alert
          showIcon={true}
          message={
            <>
              Zaps allow you to LP in any pool with any asset. Please be careful when zapping low liquidity tokens as
              there may be very high slippage. GLMR, BUSD, USDC, USDT, DAI, BNB and GLINT are the safest tokens to zap
              with. If price impact seems too high, try disabling multihop. Sign and Stake button will stake ALL of your
              LP tokens in the farm.
            </>
          }
          type="warning"
        />
      </RowBetween>
    </AutoColumn>
  )
}

const DEFAULT_ZAP_SLIPPAGE_TOLERANCE = new Percent(5, 100)

export default function Zap() {
  const { i18n } = useLingui()

  const { account, chainId } = useActiveWeb3React()

  const loadedUrlParams = useDefaultsFromURLSearch()
  const farmingPools = Object.keys(POOLS[chainId]).map((key) => {
    return { ...POOLS[chainId][key], lpToken: key }
  })

  const [poolAddress, currencyId] = [loadedUrlParams?.poolAddress, loadedUrlParams?.currencyId]
  const pool = farmingPools.find((r) => r.lpToken.toString().toLowerCase() == poolAddress?.toString().toLowerCase())

  const poolTokenSc = usePairContract(poolAddress)
  const poolTokenCurrency = useToken(poolAddress)
  const poolTokenBalance = useTokenBalance(account, poolTokenCurrency)
  const [depositValue, setDepositValue] = useState(poolTokenBalance?.toSignificant())

  const currency = useCurrency(currencyId)

  const { onFieldInput } = useZapActionHandlers(false)
  const {
    typedValue,
    currency0,
    currency1,
    poolTokenPercentage,
    currencyBalance,
    parsedAmount,
    error,
    bestTrade,
    liquidityMinted,
    currencyOneOutput,
    currencyZeroOutput,
    isTradingUnderlying,
    encodeSwapData,
  } = useDerivedZapInfo(currency ?? undefined, poolAddress)
  const { zapIn } = useZapper(currency ?? undefined)
  const dispatch = useDispatch<AppDispatch>()

  const route = bestTrade?.route
  const noRoute = !route

  const { priceImpact } = useMemo(() => {
    if (!bestTrade) return { realizedLPFee: undefined, priceImpact: undefined }

    const realizedLpFeePercent = computeRealizedLPFeePercent(bestTrade)
    const realizedLPFee = bestTrade.inputAmount.multiply(realizedLpFeePercent)
    const priceImpact = bestTrade.priceImpact.subtract(realizedLpFeePercent)
    return { priceImpact, realizedLPFee }
  }, [bestTrade])

  const priceImpactSeverity = warningSeverity(priceImpact)
  const zapperAddress = ZAPPER_ADDRESS[chainId]

  // // check whether the user has approved the router on the input token
  const [approval, approveCallback] = useApproveCallback(parsedAmount, zapperAddress)
  const [zapFinished, setZapFinished] = useState(false)

  // check if user has gone through approval process, used to show two step buttons, reset on token change
  const [approvalSubmitted, setApprovalSubmitted] = useState<boolean>(false)

  // get custom setting values for user in bips
  const allowedSlippage = useUserSlippageToleranceWithDefault(DEFAULT_ZAP_SLIPPAGE_TOLERANCE)

  const typedDepositValue = tryParseAmount(poolTokenBalance?.toSignificant(), poolTokenCurrency)

  const [approvalState, approve] = useApproveCallback(typedDepositValue, BEAMCHEF_ADDRESS[chainId])

  // Get min pooltokens received based on user slippage preferences
  const minTokensReceived = JSBI.divide(
    // Take raw token (number * (10000 - ALLOWED_SLIPPAGE))/10000

    // JSBI.multiply(liquidityMinted?.quotient || JSBI.BigInt(0), JSBI.BigInt(10000 - allowedSlippage)),
    JSBI.multiply(liquidityMinted?.quotient || JSBI.BigInt(0), allowedSlippage.quotient),
    JSBI.BigInt(10000)
  )

  // mark when a user has submitted an approval, reset onTokenSelection for input field
  useEffect(() => {
    if (approval === ApprovalState.PENDING) {
      setApprovalSubmitted(true)
    }
  }, [approval, approvalSubmitted])

  // show approve flow when: no error on inputs, not approved or pending, or approved in current session
  const showApproveFlow =
    !error &&
    (approval === ApprovalState.NOT_APPROVED ||
      approval === ApprovalState.PENDING ||
      (approvalSubmitted && approval === ApprovalState.APPROVED))

  const handleCurrencyASelect = useCallback(
    (currency: Currency) => {
      const newCurrencyId = getCurrencyId(currency)
      Router.push(`zap?poolAddress=${poolAddress}&currencyId=${newCurrencyId}`)
    },
    [poolAddress]
  )

  const addTransaction = useTransactionAdder()

  const toggleWalletModal = useWalletModalToggle()

  const { gatherPermitSignature, signatureData } = useV2LiquidityTokenPermit(
    typedDepositValue,
    BEAMCHEF_ADDRESS[chainId]
  )

  async function onAttemptToApprove() {
    const bal = await poolTokenSc.balanceOf(account)
    setDepositValue(ethers.utils.formatEther(bal))

    if (gatherPermitSignature) {
      try {
        await gatherPermitSignature()
      } catch (error) {
        console.log(error)

        // try to approve if gatherPermitSignature failed for any reason other than the user rejecting it
        if (error?.code > 1) {
          await approve()
        }
      }
    } else {
      await approve()
    }
  }

  const { depositWithPermit } = useMasterChef()
  const [pendingTx, setPendingTx] = useState(false)
  useEffect(() => {
    async function depositPermit() {
      setPendingTx(true)
      try {
        //  const tx = await beamShareContract.enter(stakeAmount)
        const tx = await depositWithPermit(
          pool?.id,
          poolTokenBalance.toSignificant().toBigNumber(poolTokenCurrency?.decimals),
          signatureData.deadline,
          signatureData.v,
          signatureData.r,
          signatureData.s
        )

        addTransaction(tx, {
          summary: `${i18n._(t`Deposit`)} ${
            pool.token1 ? `${pool.token0.symbol}/${pool.token1.symbol}` : pool.token0.symbol
          }`,
        })
      } catch (error) {
        if (error?.code > 1) {
          await approve()
          setPendingTx(false)
        }
        console.error(error)
      }
      setPendingTx(false)
    }
    if (signatureData && !pendingTx) {
      depositPermit()
    } else if (zapFinished) {
      // onAttemptToApprove();
    }
  }, [signatureData])

  const zapCallback = useCallback(() => {
    const swapData = encodeSwapData()

    zapIn(
      currency === NATIVE[chainId] ? '0x0000000000000000000000000000000000000000' : currencyId,
      poolAddress,
      parsedAmount,
      currency === NATIVE[chainId] && isTradingUnderlying
        ? WNATIVE[chainId || 1].address
        : isTradingUnderlying
        ? poolAddress
        : ROUTER_ADDRESS[chainId],
      minTokensReceived.toString(),
      swapData
    ).then(
      async (obj) => {
        await obj.tx.wait()
        const bal = await poolTokenSc.balanceOf(account)
        setDepositValue(ethers.utils.formatEther(bal))
        setZapFinished(true)
        dispatch(resetZapState())
        console.log('zap finished')
      },
      () => {
        //  toastError('Error', 'Please try again. Confirm the transaction and make sure you are paying enough gas!')
        // alert('Please input 2 decimals max.')
      }
    )
  }, [
    encodeSwapData,
    zapIn,
    currency,
    currencyId,
    poolAddress,
    parsedAmount,
    isTradingUnderlying,
    chainId,
    minTokensReceived,
    dispatch,
  ])

  const showRoute = Boolean(bestTrade && bestTrade.route.path.length > 2)

  return (
    <>
      <Head>
        <title>Beamswap | {i18n._(t`Zap`)}</title>
        <meta
          name="description"
          content="Beamswap allows for swapping of ERC20 compatible tokens across multiple networks"
        />
      </Head>
      {!poolAddress ? (
        <PoolList />
      ) : (
        <div className="container staking-container max-w-2xl px-0 mx-auto sm:px-4">
          <DoubleGlowShadow maxWidth={false} opacity={'0.6'}>
            <div className="w-full max-w-xl p-7 bg-deepCove shadow-swap mr-auto ml-auto">
              <CardHeader />
              <AutoColumn>
                <CurrencyInputPanel
                  label={'From'}
                  showMaxButton={true}
                  onMax={() => {
                    onFieldInput(maxAmountSpend(currencyBalance)?.toFixed(2) ?? '')
                  }}
                  value={typedValue ?? ''}
                  currency={currency}
                  onUserInput={onFieldInput}
                  onCurrencySelect={handleCurrencyASelect}
                  id="zap-currency-input"
                  showCommonBases
                />
                <PoolAllocationWrapper>
                  <RowBetween style={{ marginBottom: '12px' }}>
                    <div className="text-white" style={{ fontSize: '14px' }}>
                      To
                    </div>
                    {currency0 && currency1 ? (
                      <DoubleCurrencyLogo
                        currency0={currency0 ?? undefined}
                        currency1={currency1 ?? undefined}
                        margin={false}
                        size={20}
                      />
                    ) : (
                      <Skeleton
                        style={{
                          width: '60px',
                          height: '20px',
                        }}
                      />
                    )}
                  </RowBetween>
                  <RowBetween>
                    <div
                      style={{
                        fontWeight: 500,
                        fontSize: '22px',
                      }}
                    >
                      {liquidityMinted?.toSignificant(6) || '0'}
                    </div>
                    <div className="inline-flex text-white">
                      {currency0 && currency1 ? (
                        <>
                          <div
                            style={{
                              fontWeight: 500,
                              fontSize: '22px',
                            }}
                          >
                            {`${currency0?.symbol}${' '}`}
                          </div>
                          <div
                            style={{
                              fontWeight: 500,
                              fontSize: '22px',
                            }}
                            className="mx-1"
                          >
                            /
                          </div>
                          <div
                            style={{
                              fontWeight: 500,
                              fontSize: '22px',
                            }}
                          >
                            {`${' '}${currency1?.symbol}`}
                          </div>
                        </>
                      ) : (
                        <Skeleton
                          style={{
                            width: '120px',
                            height: '26px',
                          }}
                        />
                      )}
                    </div>
                  </RowBetween>
                </PoolAllocationWrapper>
                <PoolBreakDownWrapper>
                  <RowBetween>
                    <div className="px-3 pt-5 text-white">
                      <div style={{ fontSize: '14px' }}>Est. Pool Allocation</div>
                      <PoolTokenRow>
                        <CurrencyLogo size="22px" currency={currency0 ?? undefined} style={{ marginRight: '6px' }} />
                        <div className="pl-2 text-white" style={{ fontSize: '14px' }}>
                          {currencyZeroOutput?.toSignificant(6) || 0} {currency0?.symbol}
                        </div>
                      </PoolTokenRow>
                      <PoolTokenRow>
                        <CurrencyLogo size="22px" currency={currency1 ?? undefined} style={{ marginRight: '6px' }} />
                        <div className="pl-2 text-white" style={{ fontSize: '14px' }}>
                          {currencyOneOutput?.toSignificant(6) || 0} {currency1?.symbol}
                        </div>
                      </PoolTokenRow>
                    </div>
                    <div className="px-3 pt-5 text-white" style={{ height: '91px' }}>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <QuestionHelper text="Your share of the total liquidity pool" />
                        <div
                          style={{
                            textAlign: 'right',
                            fontSize: '14px',
                            marginLeft: '0.25rem',
                          }}
                        >
                          Pool Share
                        </div>
                      </span>
                      <div
                        style={{
                          marginBottom: '8px',
                          textAlign: 'right',
                          fontSize: '14px',
                        }}
                      >
                        {poolTokenPercentage?.toSignificant(6) || '0'}%
                      </div>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <QuestionHelper text="The difference between the market price and the estimated price due to trade size." />
                        <div
                          style={{
                            fontSize: '14px',
                            textAlign: 'right',
                            marginLeft: '0.25rem',
                          }}
                        >
                          Price Impact
                        </div>
                      </span>
                      <div
                        style={{
                          textAlign: 'right',
                          fontSize: '14px',
                        }}
                      >
                        <FormattedPriceImpact priceImpact={bestTrade?.priceImpact} />
                      </div>
                    </div>
                  </RowBetween>
                  {showRoute && (
                    <RowBetween style={{ padding: '16px 0 0 0' }}>
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <div className="text-sm text-secondary">Route</div>
                        <QuestionHelper text="Routing through these tokens resulted in the best price for your trade." />
                      </span>
                      {bestTrade && <SwapRoute trade={bestTrade} />}
                    </RowBetween>
                  )}
                </PoolBreakDownWrapper>
                <>
                  {!account ? (
                    <Button variant="outlined" color="blue" style={{ marginTop: '20px' }} onClick={toggleWalletModal}>
                      Connect Wallet
                    </Button>
                  ) : noRoute && bestTrade?.inputAmount ? (
                    <ButtonError style={{ marginTop: '20px' }}>
                      <div>Insufficient liquidity for this trade.</div>
                    </ButtonError>
                  ) : showApproveFlow ? (
                    <RowBetween>
                      <Button
                        color="gradient"
                        size="lg"
                        onClick={approveCallback}
                        disabled={approval !== ApprovalState.NOT_APPROVED || approvalSubmitted}
                        style={{
                          width: '48%',
                          marginTop: '20px',
                        }}
                      >
                        {approval === ApprovalState.PENDING ? (
                          <AutoRow gap="6px" justify="center">
                            Approving <Loader stroke="white" />
                          </AutoRow>
                        ) : approvalSubmitted && approval === ApprovalState.APPROVED ? (
                          'Approved'
                        ) : (
                          'Approve ' + currency?.symbol
                        )}
                      </Button>
                      <Button
                        color="gradient"
                        size="lg"
                        onClick={() => zapCallback()}
                        style={{
                          width: '48%',
                          marginTop: '20px',
                        }}
                        id="zap-button"
                        disabled={approval !== ApprovalState.APPROVED}
                      >
                        {error ?? 'Zap'}
                      </Button>

                      {zapFinished && (
                        <Button
                          color="gradient"
                          size="lg"
                          onClick={() => onAttemptToApprove()}
                          style={{
                            width: '48%',
                            marginTop: '20px',
                          }}
                          id="zap-button"
                          disabled={pendingTx}
                        >
                          {error ?? 'Sign and Stake'}
                        </Button>
                      )}
                    </RowBetween>
                  ) : priceImpactSeverity > 1 && error === undefined ? (
                    <ButtonError
                      disabled={priceImpactSeverity > 3}
                      error={priceImpactSeverity > 1}
                      style={{ marginTop: '20px' }}
                      onClick={() => zapCallback()}
                    >
                      {priceImpactSeverity > 3
                        ? `Price Impact Too High`
                        : `Swap${priceImpactSeverity > 2 ? ' Anyway' : ''}`}
                    </ButtonError>
                  ) : (
                    <Button
                      color="gradient"
                      size="lg"
                      style={{ marginTop: '20px' }}
                      disabled={!parsedAmount || error !== undefined || approval !== ApprovalState.APPROVED}
                      onClick={() => zapCallback()}
                    >
                      {error ?? 'Zap'}
                    </Button>
                  )}
                  {zapFinished && (
                    <Button
                      color="gradient"
                      size="lg"
                      onClick={() => onAttemptToApprove()}
                      style={{
                        width: '100%',
                        marginTop: '20px',
                      }}
                      id="zap-button"
                      disabled={pendingTx}
                    >
                      {'Sign and Stake'}
                    </Button>
                  )}
                  {showApproveFlow && (
                    <Column style={{ marginTop: '1rem' }}>
                      <ProgressSteps steps={[approval === ApprovalState.APPROVED]} />
                    </Column>
                  )}
                </>
              </AutoColumn>
            </div>
          </DoubleGlowShadow>
        </div>
      )}
    </>
  )
}
