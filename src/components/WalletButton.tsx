import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface WalletButtonProps {
    onConnect: (publicKey: string) => void;
}

export default function WalletButton({ onConnect }: WalletButtonProps) {
    const { publicKey, connected } = useWallet();

    React.useEffect(() => {
        if (connected && publicKey) {
            onConnect(publicKey.toString());
        }
    }, [connected, publicKey, onConnect]);

    return (
        <div className="flex justify-center px-4">
            <WalletMultiButton 
                className="
                    !bg-blue-600 
                    hover:!bg-blue-700 
                    !text-white 
                    !border-0 
                    !rounded-xl 
                    !px-6 
                    !py-4
                    !text-base
                    !font-medium
                    !min-h-[56px]
                    !w-full
                    !max-w-[280px]
                    transition-all 
                    duration-200 
                    !shadow-lg
                    hover:!shadow-xl
                    hover:!scale-[1.02]
                    active:!scale-[0.98]
                    !cursor-pointer
                    touch-manipulation
                " 
            />
        </div>
    );
}