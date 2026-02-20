package com.inventario.lectora;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HoneywellScannerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
