import scala.concurrent.duration._

import io.gatling.core.Predef._
import io.gatling.http.Predef._

class {{outputName}} extends Simulation {
	var feeder = jsonFile("{{outputName}}.json").circular

	val httpProtocol = http

	val scn = scenario("{{outputName}}")
		.feed(feeder)
{{requests}}

	setUp(scn.inject(
		atOnceUsers(1)
	)).protocols(httpProtocol)
}
