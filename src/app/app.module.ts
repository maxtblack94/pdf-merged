import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { MaintenanceComponent } from './maintenance.component';
import { LazyVisibleDirective } from './lazy-visible.directive';

@NgModule({
  declarations: [
    AppComponent,
    MaintenanceComponent,
    LazyVisibleDirective
  ],
  imports: [
    BrowserModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
