package com.fabio.estudobiblico;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.fabio.estudobiblico.plugins.BibleCorePlugin;
import com.fabio.estudobiblico.plugins.MapReaderPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BibleCorePlugin.class);
        registerPlugin(MapReaderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
