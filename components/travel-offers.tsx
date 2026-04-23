"use client"

import Image from "next/image"
import Link from "next/link"
import { Car, Building2, Star, ArrowRight } from "lucide-react"

const carRentals = [
  { id: "car-citroen-c1", name: "Citroen C1", supplier: "Europcar", price: 25, image: "/images/cars/citroen-c1.png", type: "Mini", seats: 4 },
  { id: "car-opel-corsa", name: "Opel Corsa", supplier: "Sixt", price: 32, image: "/images/cars/opel-corsa.png", type: "Economy", seats: 5 },
  { id: "car-toyota-yaris", name: "Toyota Yaris", supplier: "Hertz", price: 35, image: "/images/cars/toyota-yaris.png", type: "Economy", seats: 5 },
  { id: "car-bmw-1", name: "BMW 1 Series", supplier: "Sixt", price: 49, image: "/images/cars/bmw-1.png", type: "Compact", seats: 5 },
  { id: "car-volvo-xc40", name: "Volvo XC40", supplier: "Enterprise", price: 62, image: "/images/cars/volvo-xc40.png", type: "SUV", seats: 5 },
  { id: "car-seat-alhambra", name: "SEAT Alhambra", supplier: "Europcar", price: 69, image: "/images/cars/seat-alhambra.png", type: "Van", seats: 7 },
]

const hotels = [
  { id: "hotel-place-darmes", name: "Hotel Le Place d'Armes", stars: 5, price: 189, image: "/images/hotels/place-darmes.jpg", area: "City Center" },
  { id: "hotel-parc-belair", name: "Hotel Parc Belair", stars: 4, price: 129, image: "/images/hotels/parc-belair.jpg", area: "Belair" },
  { id: "hotel-melia", name: "Melia Luxembourg", stars: 4, price: 109, image: "/images/hotels/melia.jpg", area: "Kirchberg" },
  { id: "hotel-youth", name: "Luxembourg Youth Hostel", stars: 2, price: 39, image: "/images/hotels/youth-hostel.jpg", area: "Pfaffenthal" },
]

export function TravelOffers({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "space-y-4" : "space-y-8"}>
      {/* Car Rentals */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4 text-muted-foreground" />
            <h3 className={`font-semibold text-foreground ${compact ? "text-sm" : "text-base"}`}>Car Rentals in Luxembourg</h3>
          </div>
          <Link href="/cars" className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
          {carRentals.map((car) => (
            <Link key={car.id} href="/cars" className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
              <div className="relative overflow-hidden bg-muted/30" style={{ aspectRatio: "16 / 10" }}>
                <Image src={car.image} alt={car.name} fill className="object-contain p-2 transition-transform duration-300 group-hover:scale-105" sizes={compact ? "150px" : "(max-width: 640px) 50vw, 33vw"} />
                <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-bold text-foreground backdrop-blur-sm">{car.supplier}</span>
              </div>
              <div className="flex flex-1 flex-col p-3">
                <p className={`font-semibold text-card-foreground group-hover:text-primary transition-colors ${compact ? "text-xs" : "text-sm"}`}>{car.name}</p>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{car.type}</span>
                  <span>{car.seats} seats</span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className={`font-bold text-foreground ${compact ? "text-sm" : "text-base"}`}>{car.price} &euro;</span>
                  <span className="text-[10px] text-muted-foreground">/ day</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground/60">Powered by Travelpayouts</p>
      </section>

      {/* Hotels */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className={`font-semibold text-foreground ${compact ? "text-sm" : "text-base"}`}>Hotels near trip result</h3>
          </div>
          <Link href="/hotels" className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"}`}>
          {hotels.map((hotel) => (
            <Link key={hotel.id} href="/hotels" className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
              <div className="relative overflow-hidden" style={{ aspectRatio: compact ? "16 / 10" : "4 / 3" }}>
                <Image src={hotel.image} alt={hotel.name} fill className="object-cover transition-transform duration-300 group-hover:scale-105" sizes={compact ? "150px" : "(max-width: 640px) 50vw, 25vw"} />
                <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-bold text-foreground backdrop-blur-sm">{hotel.area}</span>
              </div>
              <div className="flex flex-1 flex-col p-3">
                <p className={`font-semibold text-card-foreground line-clamp-1 group-hover:text-primary transition-colors ${compact ? "text-xs" : "text-sm"}`}>{hotel.name}</p>
                <div className="mt-0.5 flex items-center gap-0.5">
                  {Array.from({ length: hotel.stars }).map((_, i) => (
                    <Star key={i} className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className={`font-bold text-foreground ${compact ? "text-sm" : "text-base"}`}>{hotel.price} &euro;</span>
                  <span className="text-[10px] text-muted-foreground">/ night</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground/60">Powered by Travelpayouts</p>
      </section>
    </div>
  )
}
