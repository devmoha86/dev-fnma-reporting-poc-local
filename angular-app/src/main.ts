/**
 * Angular application bootstrap.
 *
 * provideHttpClient() is REQUIRED — without it every HTTP call in
 * ReportingService throws "NullInjectorError: No provider for HttpClient".
 */

import { bootstrapApplication }    from '@angular/platform-browser';
import { provideHttpClient }        from '@angular/common/http';
import { AppComponent }             from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
  ],
}).catch(err => console.error(err));
