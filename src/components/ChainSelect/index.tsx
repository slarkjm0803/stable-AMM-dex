import { Currency, CurrencyAmount, Token } from '../../sdk'
import React, { ReactNode, useCallback, useState } from 'react'
import { classNames, formatNumberScale } from '../../functions'
import Button from '../Button'
import { ChevronDownIcon } from '@heroicons/react/outline'
import CurrencyLogo from '../CurrencyLogo'
import CurrencySearchModal from '../../modals/SearchModal/CurrencySearchModal'
import Lottie from 'lottie-react'
import { Input as NumericalInput } from '../NumericalInput'
import selectCoinAnimation from '../../animation/select-coin.json'
import { t } from '@lingui/macro'
import { useActiveWeb3React } from '../../hooks/useActiveWeb3React'
import { useCurrencyBalance } from '../../state/wallet/hooks'
import { useLingui } from '@lingui/react'
import Card from '../Card'
import Logo from '../Logo'
import { Chain } from '../../sdk/entities/Chain'
import { useChainModalToggle } from '../../state/application/hooks'
import ChainModal from '../../modals/ChainModal'

interface ChainSelectProps {
  availableChains: number[]
  label: string
  onChainSelect?: (chain: Chain) => void
  chain?: Chain | null
  otherChain?: Chain | null
  switchOnSelect?: boolean
}

export default function ChainSelect({
  availableChains,
  label,
  onChainSelect,
  chain,
  otherChain,
  switchOnSelect,
}: ChainSelectProps) {
  const { i18n } = useLingui()
  const [modalOpen, setModalOpen] = useState(false)
  const { account } = useActiveWeb3React()

  const handleDismissSearch = useCallback(() => {
    setModalOpen(false)
  }, [setModalOpen])

  return (
    <button
      className={'flex-1 justify-center md:w-100'}
      style={{ border: '2px solid #142970' }}
      onClick={() => {
        setModalOpen(true)
      }}
    >
      <Card
        className={
          'hover:bg-deepCove cursor-pointer h-full outline-none select-none cursor-pointer border-none text-xl font-medium items-center p-5'
        }
      >
        <div
          className="flex flex-1 flex-row items-start justify-center mt-4 text-jordyBlue"
          style={{ marginTop: '-5px', marginBottom: 10 }}
        >
          <div className="text-md">{i18n._(t`${label}`)}</div>
        </div>
        <div
          className="flex flex-row items-center justify-center bg-gradient-to-r from-light-purple via-dark-purple to-light-blue ml-auto mr-auto"
          style={{ maxWidth: 187 }}
        >
          <div className="flex items-center bg-blue pl-5 pr-5" style={{ margin: 2, minWidth: 184 }}>
            <div className="flex items-center" style={{ margin: 10, marginLeft: 0 }}>
              <Logo srcs={[chain?.icon]} width={'24px'} height={'24px'} alt={chain?.name} />
            </div>
            <div className="flex flex-1 flex-row items-start justify-center">
              <div className="flex items-center">
                <div
                  className="text-lg font-bold token-symbol-container md:text-2xl text-white"
                  style={{ fontSize: 18 }}
                >
                  {chain?.name}
                </div>
                <ChevronDownIcon width={16} height={16} className="ml-2 stroke-current" />
              </div>
            </div>
          </div>
        </div>
      </Card>
      <ChainModal
        switchOnSelect={switchOnSelect}
        availableChains={availableChains}
        onSelect={onChainSelect}
        title={`Bridge ${label}`}
        chain={chain}
        isOpen={modalOpen}
        onDismiss={handleDismissSearch}
      />
    </button>
  )
}
